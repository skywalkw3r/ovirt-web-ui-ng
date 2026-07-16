import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  Badge,
  Button,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Label,
  PageSection,
  Skeleton,
  Tab,
  TabTitleText,
  Tabs,
  TreeView,
  type TreeViewDataItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { ClusterIcon, InfrastructureIcon, ServerIcon } from '@patternfly/react-icons'
import { Link } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import type { Cluster } from '../api/schemas/cluster'
import type { DataCenter } from '../api/schemas/datacenter'
import type { Host } from '../api/schemas/host'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { ClusterContextMenu } from '../components/cluster-actions/ClusterContextMenu'
import { ClusterFormModal } from '../components/cluster-form/ClusterFormModal'
import {
  treeRowContextValue,
  useContextMenu,
  type ContextMenuPosition,
} from '../components/context-menu/ContextMenu'
import { DataCenterContextMenu } from '../components/datacenter-actions/DataCenterContextMenu'
import { HostActionsMenu } from '../components/host-actions/HostActionsMenu'
import { NewHostModal } from '../components/host-form/NewHostModal'
import { ClusterHealthBadge } from '../components/ClusterHealthBadge'
import { InventoryTreeSidebar } from '../components/InventoryTreeSidebar'
import { InventoryViewSwitcher } from '../components/InventoryViewSwitcher'
import { InventoryToolbar } from '../components/list-toolbar/InventoryToolbar'
import { PaneToolbar } from '../components/list-toolbar/PaneToolbar'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { HostedEngineCrown } from '../components/HostedEngineCrown'
import { hostStatusColor, hostStatusIcon } from '../components/hostStatus'
import { HostStatusCell, UsageBar, VmCountCell } from '../components/HostListCells'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { PaneHeader } from '../components/PaneHeader'
import { StatusBadge, type StatusBadgeColor } from '../components/StatusBadge'
import { VmActionsMenu } from '../components/VmActionsMenu'
import { CreateVmButton } from '../components/vm-create/CreateVmWizard'
import {
  VM_LIST_COLUMNS,
  type VmListColumn,
  type VmListCtx,
  type VmListRow,
} from '../components/vmListColumns'
import { useColumnPrefs, type ColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useDataCenters, useClustersInventory } from '../hooks/useAdminResources'
import { useHosts, useHostsUsage } from '../hooks/useHosts'
import { useVms } from '../hooks/useVms'
import { downloadCsv, toCsv } from '../lib/csv'
import { formatBytes, hostSpmText, statusText } from '../lib/format'
import { hostGauges, hostNetworkPercent } from '../lib/utilization'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'

// The structural hierarchy (data center → cluster → host, from the entity
// links — not tags), with VM-count badges. Selecting a node switches the
// content pane: every layer offers Clusters/Hosts/VMs browse tabs scoped to
// the selection. Read/browse only — entity-level actions (cluster Edit/
// Upgrade/Remove, etc.) live on the detail pages, reached via Open details.
// Folders stay on the VMs & Templates view; this one is pure infrastructure.
//
// The page component owns every piece of cross-pane state — selection, tab,
// sorts, paging, column prefs, context menus — because the section components
// below unmount on tab switches (and the VM pane moves between the bare and
// tabbed render positions), so any state they held would silently reset.
// The sections themselves are presentational: they receive their rows, column
// prefs and sort handles as props and own only their markup.

// Tree node ids are kind-namespaced so the selection handler can recover the
// kind without a lookup.
const ROOT_ID = 'all-infrastructure'
// session-scoped view memory for the tree selection (see selectedId below)
const INFRA_SELECTED_KEY = 'console-infra-selected'
type NodeKind = 'datacenter' | 'cluster' | 'host'
const nodeId = (kind: NodeKind, id: string) => `${kind}:${id}`

type PaneTabKey = 'vms' | 'hosts' | 'clusters' | 'datacenters'

const byName = <T extends { name?: string }>(a: T, b: T) =>
  (a.name ?? '').localeCompare(b.name ?? '')

// stable empty-list identity so the memoized derivations below don't rebuild
// on every render while a query is still pending
const EMPTY: never[] = []

function parseNodeId(value: string): { kind: NodeKind; id: string } | null {
  const colon = value.indexOf(':')
  if (colon === -1) return null
  const kind = value.slice(0, colon)
  if (kind !== 'datacenter' && kind !== 'cluster' && kind !== 'host') return null
  return { kind, id: value.slice(colon + 1) }
}

// Right-click target for the tree menu: the concrete entity snapshotted at
// right-click time. The render below re-resolves it against the latest poll
// data so menu item gating tracks live status; the snapshot covers the gap if
// a refetch drops the entity while its menu is open.
type TreeMenuCtx =
  | { kind: 'host'; host: Host }
  | { kind: 'cluster'; cluster: Cluster }
  | { kind: 'datacenter'; dataCenter: DataCenter }

// Compatibility version as a plain "major.minor" string (the engine ships the
// scalars as JSON strings, already coerced by the schema) — undefined when the
// entity carries no version, so the header meta can drop the fact entirely.
// Mirrors the ClustersPage / DataCenterClustersTab cell renderers.
function compatString(version: { major?: number; minor?: number } | undefined): string | undefined {
  if (version?.major === undefined) return undefined
  return version.minor === undefined ? `${version.major}` : `${version.major}.${version.minor}`
}

// icon-color token per status color, for the small corner badge on the tree
// server icon
const STATUS_ICON_COLOR: Record<StatusBadgeColor, string> = {
  green: 'var(--pf-t--global--icon--color--status--success--default)',
  red: 'var(--pf-t--global--icon--color--status--danger--default)',
  yellow: 'var(--pf-t--global--icon--color--status--warning--default)',
  orange: 'var(--pf-t--global--icon--color--status--warning--default)',
  blue: 'var(--pf-t--global--icon--color--status--info--default)',
  teal: 'var(--pf-t--global--icon--color--status--info--default)',
  purple: 'var(--pf-t--global--icon--color--status--info--default)',
  grey: 'var(--pf-t--global--icon--color--subtle)',
}

// Host tree node icon: the server icon carrying a small status badge in the
// corner — green check = up, red = failure, yellow wrench = maintenance, blue
// = the transitional walk — so status reads at a glance in the navigator
// without losing the host identity, alongside the HE crown beside the name.
// The status word rides as the hover title; the content pane's HostStatusCell
// carries it accessibly. Falls back to a plain server icon when the engine
// hasn't reported a status yet.
function HostTreeIcon({ status }: { status: string | undefined }) {
  if (!status) return <ServerIcon />
  const normalized = status.toLowerCase()
  const Glyph = hostStatusIcon(normalized)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} title={statusText(status)}>
      <ServerIcon />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: '-3px',
          insetInlineEnd: '-4px',
          display: 'inline-flex',
          lineHeight: 0,
          fontSize: '0.7em',
          color: STATUS_ICON_COLOR[hostStatusColor(normalized)],
          background: 'var(--pf-t--global--background--color--primary--default)',
          borderRadius: '50%',
        }}
      >
        <Glyph />
      </span>
    </span>
  )
}

// The scoped-VM table (area 'infra-vms') renders the shared VM-list catalog
// (vmListColumns) — the same picker set, defaults, and order as the VMs &
// Templates view, so the two inventory surfaces never drift. Rows here are
// always VMs; they wrap into the shared { kind: 'vm' } row shape and the
// host/cluster/DC names join client-side over the already-cached inventories
// via ctx.

// Legacy webadmin hosts-grid parity for the cluster pane (area 'infra-hosts'):
// the flat /hosts page's column set re-defaulted for cluster scope — the
// utilization gauges stay on; the locating joins (Cluster / Data Center) and
// Hostname/IP ship opt-in, because the tree selection already locates the row
// and webadmin itself defaults Hostname/IP off. Cluster/DC names resolve via
// client-side joins over the cached inventories, passed through ctx so the
// cells stay pure.
interface InfraHostColumnCtx {
  clusterName: (id: string | undefined) => string | undefined
  dataCenter: (clusterId: string | undefined) => { id: string; name: string } | undefined
  t: ReturnType<typeof useT>
}

interface InfraHostColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // free-text columns single-line: truncate + a native title on the cell
  modifier?: 'truncate'
  title?: (host: Host) => string | undefined
  // opt-in header sort: extract the comparable value (see hooks/useColumnSort)
  sortValue?: (host: Host, ctx: InfraHostColumnCtx) => string | number | undefined
  cell: (host: Host, ctx: InfraHostColumnCtx) => ReactNode
}

const INFRA_HOST_COLUMNS: InfraHostColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (host) => host.name,
    always: true,
    modifier: 'truncate',
    title: (host) => host.name,
    cell: (host) => (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--pf-t--global--spacer--sm)',
        }}
      >
        {/* crown leads the name so the HE markers align down the column */}
        <HostedEngineCrown hostedEngine={host.hosted_engine} hostId={host.id} />
        <Link to="/hosts/$hostId" params={{ hostId: host.id }}>
          {host.name}
        </Link>
      </span>
    ),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (host) => host.comment || undefined,
    defaultHidden: true,
    modifier: 'truncate',
    title: (host) => host.comment || undefined,
    cell: (host) => host.comment || '—',
  },
  {
    key: 'address',
    labelId: 'hosts.column.address',
    sortValue: (host) => host.address,
    defaultHidden: true,
    cell: (host) => host.address ?? '—',
  },
  {
    key: 'cluster',
    labelId: 'hosts.column.cluster',
    sortValue: (host, ctx) => ctx.clusterName(host.cluster?.id),
    defaultHidden: true,
    // linked to the cluster detail page; falls back to plain text (or the em
    // dash) while the clusters inventory join hasn't resolved a name yet
    cell: (host, ctx) => {
      const name = ctx.clusterName(host.cluster?.id)
      if (host.cluster?.id === undefined || name === undefined) return name ?? '—'
      return (
        <Link to="/clusters/$clusterId" params={{ clusterId: host.cluster.id }}>
          {name}
        </Link>
      )
    },
  },
  {
    key: 'datacenter',
    labelId: 'hosts.column.datacenter',
    sortValue: (host, ctx) => ctx.dataCenter(host.cluster?.id)?.name,
    defaultHidden: true,
    // linked to the data center detail page; em dash while the cluster→DC
    // join hasn't resolved yet — same convention as the cluster cell above
    cell: (host, ctx) => {
      const dc = ctx.dataCenter(host.cluster?.id)
      if (dc === undefined) return '—'
      return (
        <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dc.id }}>
          {dc.name}
        </Link>
      )
    },
  },
  {
    key: 'status',
    labelId: 'common.field.status',
    cell: (host, ctx) => (
      <HostStatusCell host={host} updateLabel={ctx.t('host.upgrade.available')} />
    ),
  },
  {
    key: 'vms',
    labelId: 'hosts.column.vms',
    sortValue: (host) => host.summary?.total,
    cell: (host) => <VmCountCell summary={host.summary} />,
  },
  {
    key: 'memory',
    labelId: 'hosts.column.memory',
    sortValue: (host) => {
      const { memoryUsed, memoryTotal } = hostGauges(host)
      return memoryUsed !== undefined && memoryTotal ? (memoryUsed / memoryTotal) * 100 : undefined
    },
    cell: (host, ctx) => {
      const { memoryUsed, memoryTotal } = hostGauges(host)
      if (memoryUsed === undefined || !memoryTotal) return '—'
      return (
        <UsageBar
          percent={(memoryUsed / memoryTotal) * 100}
          label={ctx.t('hosts.memory.measure', {
            used: formatBytes(memoryUsed),
            total: formatBytes(memoryTotal),
          })}
          ariaLabel={ctx.t('hosts.usage.memory', { name: host.name })}
        />
      )
    },
  },
  {
    key: 'cpu',
    labelId: 'hosts.column.cpu',
    sortValue: (host) => hostGauges(host).cpuUsedPercent,
    cell: (host, ctx) => {
      const { cpuUsedPercent } = hostGauges(host)
      if (cpuUsedPercent === undefined) return '—'
      return (
        <UsageBar
          percent={cpuUsedPercent}
          ariaLabel={ctx.t('hosts.usage.cpu', { name: host.name })}
        />
      )
    },
  },
  {
    key: 'network',
    labelId: 'hosts.column.network',
    sortValue: (host) => hostNetworkPercent(host),
    cell: (host, ctx) => {
      const percent = hostNetworkPercent(host)
      if (percent === undefined) return '—'
      return (
        <UsageBar percent={percent} ariaLabel={ctx.t('hosts.usage.network', { name: host.name })} />
      )
    },
  },
  {
    key: 'spm',
    labelId: 'hosts.column.spm',
    sortValue: (host) => hostSpmText(host.spm),
    cell: (host) => hostSpmText(host.spm),
  },
  {
    key: 'os',
    labelId: 'hosts.column.os',
    sortValue: (host) => host.os?.version?.full_version ?? host.version?.full_version,
    defaultHidden: true,
    cell: (host) => host.os?.version?.full_version ?? host.version?.full_version ?? '—',
  },
]

// Drill-down pane for a DATA CENTER selection: its clusters as a grid —
// Same coloring policy as the flat /datacenters page: only the two states an
// admin acts on routinely get a signal, everything else stays grey.
function DataCenterStatusCell({ status }: { status?: string }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const color = normalized === 'up' ? 'green' : normalized === 'maintenance' ? 'yellow' : 'grey'
  return <StatusBadge color={color}>{statusText(status)}</StatusBadge>
}

// The root pane's Data centers grid (area 'infra-datacenters') — the outermost
// rung of the drill hierarchy, so it exists only at the root (inside a DC there
// is nothing to list). Same column set as the flat /datacenters page, which is
// what lets that page stay out of the nav; the free-text columns pick up the
// truncate+title treatment the infra grids use. Rows carry no kebab: a click
// drills the tree into the DC, right-click opens the shared DataCenterContextMenu.
interface InfraDataCenterColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  modifier?: 'truncate'
  title?: (dc: DataCenter) => string | undefined
  sortValue?: (dc: DataCenter) => string | number | undefined
  cell: (dc: DataCenter, t: ReturnType<typeof useT>) => ReactNode
}

const INFRA_DATACENTER_COLUMNS: InfraDataCenterColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    always: true,
    modifier: 'truncate',
    title: (dc) => dc.name,
    sortValue: (dc) => dc.name,
    cell: (dc) => (
      <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dc.id }}>
        {dc.name}
      </Link>
    ),
  },
  {
    key: 'storageType',
    labelId: 'datacenters.column.storageType',
    // dc.local: the single-host local-storage kind vs the ordinary shared kind
    sortValue: (dc) => (dc.local === undefined ? undefined : dc.local ? 'local' : 'shared'),
    cell: (dc, t) =>
      dc.local === undefined
        ? '—'
        : dc.local
          ? t('datacenters.storageLocal')
          : t('datacenters.storageShared'),
  },
  {
    key: 'status',
    labelId: 'common.field.status',
    sortValue: (dc) => (dc.status === undefined ? undefined : statusText(dc.status)),
    cell: (dc) => <DataCenterStatusCell status={dc.status} />,
  },
  {
    key: 'compatVersion',
    labelId: 'common.field.compatVersion',
    sortValue: (dc) =>
      dc.version?.major !== undefined ? `${dc.version.major}.${dc.version.minor ?? 0}` : undefined,
    cell: (dc) => compatString(dc.version) ?? '—',
  },
  {
    key: 'storageFormat',
    labelId: 'datacenters.column.storageFormat',
    defaultHidden: true,
    sortValue: (dc) => dc.storage_format,
    cell: (dc) => dc.storage_format ?? '—',
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    defaultHidden: true,
    modifier: 'truncate',
    title: (dc) => dc.comment || undefined,
    sortValue: (dc) => dc.comment || undefined,
    cell: (dc) => dc.comment || '—',
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    modifier: 'truncate',
    title: (dc) => dc.description || undefined,
    sortValue: (dc) => dc.description || undefined,
    cell: (dc) => dc.description || '—',
  },
]

// webadmin's DC → Clusters subtab — completing the tree's drill hierarchy
// (root → VMs, DC → clusters, cluster → hosts, host → VMs). Host/VM tallies
// join client-side over the cached inventories through ctx. Rows carry no
// kebab: right-click opens the full ClusterContextMenu (shared with the
// tree). Cluster-level actions (Edit/Upgrade/Remove) live on the detail page,
// reached via Open details — this inventory pane is read/browse only.
interface InfraClusterColumnCtx {
  hostCount: (clusterId: string) => number
  vmCount: (clusterId: string) => number
}

interface InfraClusterColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // free-text columns single-line: truncate + a native title on the cell
  modifier?: 'truncate'
  title?: (cluster: Cluster) => string | undefined
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (cluster: Cluster, ctx: InfraClusterColumnCtx) => string | number | undefined
  cell: (cluster: Cluster, ctx: InfraClusterColumnCtx) => ReactNode
}

const INFRA_CLUSTER_COLUMNS: InfraClusterColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    always: true,
    modifier: 'truncate',
    title: (cluster) => cluster.name,
    sortValue: (cluster) => cluster.name,
    cell: (cluster) => (
      <Link to="/clusters/$clusterId" params={{ clusterId: cluster.id }}>
        {cluster.name}
      </Link>
    ),
  },
  {
    key: 'compatVersion',
    labelId: 'common.field.compatVersion',
    sortValue: (cluster) =>
      cluster.version?.major !== undefined
        ? `${cluster.version.major}.${cluster.version.minor ?? 0}`
        : undefined,
    cell: (cluster) => compatString(cluster.version) ?? '—',
  },
  {
    key: 'cpuType',
    labelId: 'clusters.column.cpuType',
    sortValue: (cluster) => cluster.cpu?.type,
    cell: (cluster) => cluster.cpu?.type ?? '—',
  },
  {
    key: 'hosts',
    labelId: 'clusters.column.hostCount',
    sortValue: (cluster, ctx) => ctx.hostCount(cluster.id),
    cell: (cluster, ctx) => ctx.hostCount(cluster.id),
  },
  {
    key: 'vms',
    labelId: 'clusters.column.vmCount',
    sortValue: (cluster, ctx) => ctx.vmCount(cluster.id),
    cell: (cluster, ctx) => ctx.vmCount(cluster.id),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    defaultHidden: true,
    modifier: 'truncate',
    title: (cluster) => cluster.comment || undefined,
    sortValue: (cluster) => cluster.comment || undefined,
    cell: (cluster) => cluster.comment || '—',
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    modifier: 'truncate',
    title: (cluster) => cluster.description || undefined,
    sortValue: (cluster) => cluster.description || undefined,
    cell: (cluster) => cluster.description || '—',
  },
]

// The localized column shapes the label-resolving memos produce; the section
// components below take these so pickers and headers read one array.
type LabeledVmColumn = VmListColumn & { label: string }
type LabeledHostColumn = InfraHostColumn & { label: string }
type LabeledClusterColumn = InfraClusterColumn & { label: string }
type LabeledDataCenterColumn = InfraDataCenterColumn & { label: string }
type SortHandle = ReturnType<typeof useColumnSort>

// A row click means "drill into this cluster" only when it lands on the row
// itself — the name link and any future controls keep their own behavior.
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, label') !== null
}

// The navigator column: the inventory-view tab strip pinned full-width atop
// the tree, matching the VMs & Templates view. The wrapping div's
// onContextMenu is the tree-wide right-click delegation (see the handler in
// the page component).
function InfraTreePanel({
  treeData,
  filtering,
  selectedId,
  onSelect,
  onTreeContextMenu,
}: {
  treeData: TreeViewDataItem[]
  // true while a search filter is active — drives the collapse-when-idle,
  // expand-while-searching remount of the tree below
  filtering: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onTreeContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const t = useT()
  return (
    <InventoryTreeSidebar>
      <div style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
        <InventoryViewSwitcher active="infra" fill />
      </div>
      <div onContextMenu={onTreeContextMenu}>
        <TreeView
          // Remount on the idle↔filtering transition so PF re-reads
          // defaultExpanded — an uncontrolled TreeView otherwise caches each
          // node's expand state, leaving collapsed folders shut during a search.
          key={filtering ? 'filtering' : 'idle'}
          aria-label={t('infra.tree.ariaLabel')}
          data={treeData}
          hasSelectableNodes
          activeItems={[{ id: selectedId ?? ROOT_ID, name: null }]}
          onSelect={(_event, item) => {
            onSelect(item.id === undefined || item.id === ROOT_ID ? null : item.id)
          }}
        />
      </div>
    </InventoryTreeSidebar>
  )
}

// Cluster identity banner: name + compatibility + Open details on line one,
// the locating facts (kind · data center · cpu model) beneath, the caller's
// create action pinned right.
function ClusterPaneHeader({
  cluster,
  dcName,
  actions,
}: {
  cluster: Cluster
  dcName: string | undefined
  actions: ReactNode
}) {
  const t = useT()
  const compat = compatString(cluster.version)
  return (
    <PaneHeader
      icon={<ClusterIcon />}
      name={cluster.name}
      // the data center this cluster sits in, marked with the DC icon so it
      // is not read as just another unlabelled fact beside the CPU type
      facts={[
        dcName !== undefined
          ? { icon: <InfrastructureIcon title={t('infra.kind.datacenter')} />, text: dcName }
          : undefined,
        cluster.cpu?.type,
      ]}
      actions={actions}
      badges={
        // A Label, not bare text: it sits between the h2 and the Open details
        // link, so unstyled text there reads as part of the link.
        compat !== undefined ? (
          <Label isCompact color="grey">
            {t('infra.compat', { version: compat })}
          </Label>
        ) : undefined
      }
      details={
        <Link to="/clusters/$clusterId" params={{ clusterId: cluster.id }}>
          <FormattedMessage id="infra.openDetails" />
        </Link>
      }
    />
  )
}

// Host identity banner: name + live status + Open details on line one, the
// locating facts (kind · cluster · address) beneath, the host action kebab
// pinned right. Open details sits inline by the name here, as it already did on
// the cluster and DC banners — it identifies the entity, it is not an action.
function HostPaneHeader({
  host,
  clusterName,
  actions,
}: {
  host: Host
  clusterName: string | undefined
  // the scope's create actions; the host's own kebab is appended here rather
  // than passed in, so it always sits last
  actions: ReactNode
}) {
  const t = useT()
  return (
    <PaneHeader
      icon={<ServerIcon />}
      name={host.name}
      // the cluster this host belongs to, marked with the cluster icon (the
      // address beside it needs no marker — it is self-evidently an address).
      // Most engines name a host by its FQDN and address it by the same string,
      // which spent the whole meta line repeating the <h2> above it — so the
      // address only earns its place when it actually says something new (a
      // bare name like 'node-01' addressed as node-01.lab.local, or an IP).
      facts={[
        clusterName !== undefined
          ? { icon: <ClusterIcon title={t('infra.kind.cluster')} />, text: clusterName }
          : undefined,
        host.address?.toLowerCase() === host.name.toLowerCase() ? undefined : host.address,
      ]}
      badges={<HostStatusCell host={host} updateLabel={t('host.upgrade.available')} />}
      details={
        <Link to="/hosts/$hostId" params={{ hostId: host.id }}>
          <FormattedMessage id="infra.openDetails" />
        </Link>
      }
      actions={
        <>
          {actions}
          <HostActionsMenu host={host} />
        </>
      }
    />
  )
}

// The root banner: the whole estate, counted. It stands in for an identity
// header when nothing is selected (including when a remembered selection no
// longer resolves), so exactly one banner renders at every layer and the tab
// strip below never shifts as the tree selection moves.
//
// No kind — "All infrastructure" is an aggregate, not an entity. The VM total
// rides the VM collection, which lands after the three cheap inventory reads
// that gate this pane, so it is held back rather than reported as zero while
// it loads or if it failed.
function InfraRootPaneHeader({
  dcCount,
  clusterCount,
  hostCount,
  vmCount,
  actions,
}: {
  dcCount: number
  clusterCount: number
  hostCount: number
  vmCount: number | undefined
  actions: ReactNode
}) {
  const t = useT()
  return (
    <PaneHeader
      icon={<InfrastructureIcon />}
      name={t('infra.tree.allLabel')}
      facts={[
        t('infra.root.datacenters', { count: dcCount }),
        t('infra.root.clusters', { count: clusterCount }),
        t('infra.root.hosts', { count: hostCount }),
        vmCount === undefined ? undefined : t('infra.root.vms', { count: vmCount }),
      ]}
      actions={actions}
    />
  )
}

// Data-center identity banner: name + Open details on line one, the kind +
// compatibility/storage facts beneath. Pure identity — see ClusterPaneHeader on
// where the create actions went.
function DataCenterPaneHeader({ dc, actions }: { dc: DataCenter; actions: ReactNode }) {
  const t = useT()
  const compat = compatString(dc.version)
  return (
    <PaneHeader
      icon={<InfrastructureIcon />}
      name={dc.name}
      actions={actions}
      facts={[
        compat !== undefined ? t('infra.compat', { version: compat }) : undefined,
        dc.storage_format !== undefined
          ? t('infra.datacenter.storage', { format: dc.storage_format })
          : undefined,
      ]}
      details={
        <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dc.id }}>
          <FormattedMessage id="infra.openDetails" />
        </Link>
      }
    />
  )
}

// One hosts grid serves the cluster pane and the DC/root Hosts tab — header
// sorts and row kebabs stay identical wherever the section shows. Its paging,
// export and column picker (area 'infra-hosts') ride the PaneToolbar the
// caller renders above it; the tab strip already names the pane, so the grid
// carries no heading of its own.
function ScopedHostsSection({
  rows,
  visibleColumns,
  prefs,
  sort,
  ctx,
}: {
  // the current page of hosts — paging clamps, so an empty slice means an
  // empty scope
  rows: Host[]
  visibleColumns: LabeledHostColumn[]
  prefs: ColumnPrefs
  sort: SortHandle
  ctx: InfraHostColumnCtx
}) {
  const t = useT()
  return (
    <>
      {rows.length === 0 ? (
        <EmptyState titleText={t('hosts.empty.title')}>
          <EmptyStateBody>{t('hosts.empty.body')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <div className="app-table-viewport">
          <Table
            aria-label={t('hosts.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    modifier={column.modifier}
                    sort={
                      column.sortValue !== undefined
                        ? sort.thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((host) => (
                <Tr key={host.id}>
                  {visibleColumns.map((column) => (
                    <Td
                      key={column.key}
                      dataLabel={column.label}
                      modifier={column.modifier}
                      title={column.title?.(host)}
                    >
                      {column.cell(host, ctx)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <HostActionsMenu host={host} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </>
  )
}

// One clusters grid serves the DC pane and the root Clusters tab. Clicking a
// row drills the tree into that cluster; right-click opens the shared cluster
// menu. Rows carry no kebab — this inventory pane is read/browse only.
// The root pane's Data centers grid. Clicking a row drills the tree into that
// data center; right-click opens the shared DC menu. Same read/browse posture
// as the clusters grid — no row kebab.
function ScopedDataCentersSection({
  rows,
  visibleColumns,
  prefs,
  sort,
  onDrill,
  onRowContextMenu,
}: {
  // the current page of data centers — see ScopedHostsSection on the empty check
  rows: DataCenter[]
  visibleColumns: LabeledDataCenterColumn[]
  prefs: ColumnPrefs
  sort: SortHandle
  onDrill: (dcId: string) => void
  onRowContextMenu: (event: ReactMouseEvent, dc: DataCenter) => void
}) {
  const t = useT()
  return (
    <>
      {rows.length === 0 ? (
        <EmptyState titleText={t('datacenters.empty.title')}>
          <EmptyStateBody>{t('datacenters.empty.body')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <div className="app-table-viewport">
          <Table
            aria-label={t('datacenters.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    modifier={column.modifier}
                    sort={
                      column.sortValue !== undefined
                        ? sort.thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                  >
                    {column.label}
                  </ResizableTh>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((dc) => (
                <Tr
                  key={dc.id}
                  isClickable
                  onClick={(event) => {
                    if (isInteractiveTarget(event.target)) return
                    onDrill(dc.id)
                  }}
                  onContextMenu={(event) => onRowContextMenu(event, dc)}
                >
                  {visibleColumns.map((column) => (
                    <Td
                      key={column.key}
                      dataLabel={column.label}
                      modifier={column.modifier}
                      title={column.title?.(dc)}
                    >
                      {column.cell(dc, t)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </>
  )
}

function ScopedClustersSection({
  rows,
  visibleColumns,
  prefs,
  sort,
  ctx,
  onDrill,
  onRowContextMenu,
}: {
  // the current page of clusters — see ScopedHostsSection on the empty check
  rows: Cluster[]
  visibleColumns: LabeledClusterColumn[]
  prefs: ColumnPrefs
  sort: SortHandle
  ctx: InfraClusterColumnCtx
  onDrill: (clusterId: string) => void
  onRowContextMenu: (event: ReactMouseEvent, cluster: Cluster) => void
}) {
  const t = useT()
  return (
    <>
      {rows.length === 0 ? (
        <EmptyState titleText={t('clusters.empty.title')}>
          <EmptyStateBody>{t('clusters.empty.body')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <div className="app-table-viewport">
          <Table
            aria-label={t('infra.clusters.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    modifier={column.modifier}
                    sort={
                      column.sortValue !== undefined
                        ? sort.thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                  >
                    {column.label}
                  </ResizableTh>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((cluster) => (
                <Tr
                  key={cluster.id}
                  isClickable
                  onClick={(event) => {
                    if (isInteractiveTarget(event.target)) return
                    onDrill(cluster.id)
                  }}
                  onContextMenu={(event) => onRowContextMenu(event, cluster)}
                >
                  {visibleColumns.map((column) => (
                    <Td
                      key={column.key}
                      dataLabel={column.label}
                      modifier={column.modifier}
                      title={column.title?.(cluster)}
                    >
                      {column.cell(cluster, ctx)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </>
  )
}

// The scoped-VM pane, shared by every selection layer. It owns its own four
// states: the tree renders from the cheap inventory reads, so a slow (or
// failed) VM collection only ever blanks this table, never the whole view.
// Sort, paging and prefs stay page-owned (props) because the pane unmounts on
// every tab switch; its paging, export and picker ride the caller's
// PaneToolbar, which sits above all four states so the chrome holds its place
// while the rows load.
function ScopedVmsPane({
  vmsQuery,
  pagedVms,
  visibleColumns,
  prefs,
  sort,
  ctx,
  onRowContextMenu,
}: {
  vmsQuery: ReturnType<typeof useVms>
  // the current page of VMs — see ScopedHostsSection on the empty check
  pagedVms: Vm[]
  visibleColumns: LabeledVmColumn[]
  prefs: ColumnPrefs
  sort: SortHandle
  ctx: VmListCtx
  onRowContextMenu: (event: ReactMouseEvent, vm: Vm) => void
}) {
  const t = useT()
  return (
    <>
      {vmsQuery.isPending && (
        <>
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" screenreaderText={t('infra.loading')} />
        </>
      )}

      {!vmsQuery.isPending && vmsQuery.isError && (
        <EmptyState titleText={t('infra.error.title')} status="danger">
          <EmptyStateBody>
            {vmsQuery.error instanceof Error ? vmsQuery.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void vmsQuery.refetch()}>
            <FormattedMessage id="action.retry" />
          </Button>
        </EmptyState>
      )}

      {!vmsQuery.isPending && !vmsQuery.isError && (
        <>
          {pagedVms.length === 0 ? (
            <EmptyState titleText={t('infra.vms.empty.title')}>
              <EmptyStateBody>
                <FormattedMessage id="infra.vms.empty.body" />
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <div className="app-table-viewport">
              <Table
                aria-label={t('infra.vms.ariaLabel')}
                variant="compact"
                {...resizableTableProps(prefs)}
              >
                <Thead>
                  <Tr>
                    {visibleColumns.map((column, index) => (
                      <ResizableTh
                        key={column.key}
                        columnKey={column.key}
                        label={column.label}
                        prefs={prefs}
                        presetWidth={column.width}
                        modifier={column.modifier}
                        sort={
                          column.sortValue !== undefined
                            ? sort.thSort(
                                visibleColumns.map((c) => c.key),
                                index,
                              )
                            : undefined
                        }
                      >
                        {column.label}
                      </ResizableTh>
                    ))}
                    <Th screenReaderText={t('common.field.actions')} />
                  </Tr>
                </Thead>
                <Tbody>
                  {pagedVms.map((vm) => {
                    const row: VmListRow = { kind: 'vm', vm }
                    return (
                      <Tr key={vm.id} onContextMenu={(event) => onRowContextMenu(event, vm)}>
                        {visibleColumns.map((column) => (
                          <Td
                            key={column.key}
                            dataLabel={column.label}
                            modifier={column.modifier}
                            title={column.title?.(row)}
                          >
                            {column.cell(row, ctx)}
                          </Td>
                        ))}
                        <Td dataLabel={t('common.field.actions')} isActionCell>
                          {/* the same one-kebab row actions as the VMs &
                                      Templates view (Migrate folded in) */}
                          <VmActionsMenu vm={vm} includeMigrate />
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </div>
          )}
        </>
      )}
    </>
  )
}

// The tree's right-click menu, keyed by open-token so re-opening (the same
// node or another) remounts it fresh at the new cursor position. Host nodes
// reuse the dual-mode HostActionsMenu (kebab parity plus Open details);
// cluster/DC nodes get their dedicated menus. Each menu owns its dismissal:
// an open modal or in-flight mutation keeps it mounted until done. The
// snapshot re-resolves against the latest poll data so menu item gating
// tracks live status.
function InfraTreeMenu({
  target,
  allHosts,
  allClusters,
  dcs,
  onClose,
  onEntityRemoved,
}: {
  target: { position: ContextMenuPosition; ctx: TreeMenuCtx; token: number } | null
  allHosts: Host[]
  allClusters: Cluster[]
  dcs: DataCenter[]
  onClose: () => void
  onEntityRemoved: (node: string) => void
}) {
  if (!target) return null
  const { ctx, position, token } = target
  if (ctx.kind === 'host') {
    const host = allHosts.find((candidate) => candidate.id === ctx.host.id) ?? ctx.host
    // The host's cluster ref may be a bare id stub, so resolve the display name
    // against the clusters inventory (same join the header meta line does) —
    // that name is what shows the Add VM item and seeds the wizard's Cluster
    // field. Unresolvable → no item, rather than a wizard that cannot say
    // which cluster it is creating into.
    const clusterName =
      host.cluster?.name ??
      (host.cluster?.id !== undefined
        ? allClusters.find((candidate) => candidate.id === host.cluster?.id)?.name
        : undefined)
    return (
      <HostActionsMenu
        key={`host-${host.id}-${token}`}
        host={host}
        includeOpenDetails
        addVmClusterName={clusterName}
        contextMenu={{ position, onClose }}
      />
    )
  }
  if (ctx.kind === 'cluster') {
    const cluster = allClusters.find((candidate) => candidate.id === ctx.cluster.id) ?? ctx.cluster
    return (
      <ClusterContextMenu
        key={`cluster-${cluster.id}-${token}`}
        cluster={cluster}
        position={position}
        onClose={onClose}
        onRemoved={() => onEntityRemoved(nodeId('cluster', cluster.id))}
      />
    )
  }
  const dataCenter = dcs.find((candidate) => candidate.id === ctx.dataCenter.id) ?? ctx.dataCenter
  return (
    <DataCenterContextMenu
      key={`datacenter-${dataCenter.id}-${token}`}
      dataCenter={dataCenter}
      position={position}
      onClose={onClose}
      onRemoved={() => onEntityRemoved(nodeId('datacenter', dataCenter.id))}
    />
  )
}

export function HostsClustersPage() {
  const { loaded, isAdmin } = useCapabilities()
  const dataCenters = useDataCenters()
  const clusters = useClustersInventory()
  // The cheap inventory read (all_content for the HE crown, no statistics
  // follows) drives the tree, the joins and the cluster pane's host rows — and
  // shares the ['hosts', ''] cache entry with every other inventory consumer.
  // The expensive usage read (hostsUsage below) fires only while a cluster
  // pane is open.
  const hosts = useHosts()
  const vms = useVms()
  const t = useT()
  // Session-scoped view memory: the selected node survives leaving the view so
  // switching to VMs & Templates and back lands where the admin left off. A
  // stale id resolves to no entity and falls back to the all-VMs pane, so
  // nodes removed between visits degrade safely.
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    const stored = sessionStorage.getItem(INFRA_SELECTED_KEY)
    return stored !== null && parseNodeId(stored) !== null ? stored : null
  })
  // One paging state per pane: each tab has its own row set and its own
  // PaneToolbar, so a page-2 VM list must not drag the Hosts tab to page 2.
  // Every new selection starts all three back at page 1.
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [hostPage, setHostPage] = useState(1)
  const [hostPerPage, setHostPerPage] = useState(50)
  const [clusterPage, setClusterPage] = useState(1)
  const [clusterPerPage, setClusterPerPage] = useState(50)
  const [dcPage, setDcPage] = useState(1)
  const [dcPerPage, setDcPerPage] = useState(50)
  const setSelectedId = (id: string | null) => {
    setSelectedIdState(id)
    setPage(1)
    setHostPage(1)
    setClusterPage(1)
    setDcPage(1)
    if (id === null) sessionStorage.removeItem(INFRA_SELECTED_KEY)
    else sessionStorage.setItem(INFRA_SELECTED_KEY, id)
  }
  // client-side tree name filter (hosts/clusters/DCs) — bookmarkable
  const [filter, setFilter] = useState('')
  const [isTreeOpen, setIsTreeOpen] = useState(true)
  const [creatingCluster, setCreatingCluster] = useState(false)
  const [creatingHost, setCreatingHost] = useState(false)

  // The selected node drives the content pane (resolved to entities below).
  // Parsed before the usage query so its enabled flag can key off the kind.
  const selection = selectedId === null ? null : parseNodeId(selectedId)
  // Browse tabs at EVERY layer (webadmin's per-level subtabs), scoped to the
  // selection and ordered outermost-first. Each rung drops the tab it is now
  // inside of: the root lists Data centers, a DC is already one so it starts at
  // Clusters, a cluster starts at Hosts, and a host is a leaf with only VMs.
  // The active tab defaults to the leftmost available and clamps back to it
  // whenever the current tab leaves the set (e.g. leaving the root's Data
  // centers tab for a host).
  const [paneTab, setPaneTab] = useState<PaneTabKey>('datacenters')
  const paneTabs: ReadonlyArray<PaneTabKey> =
    selection?.kind === 'host'
      ? ['vms']
      : selection?.kind === 'cluster'
        ? ['hosts', 'vms']
        : selection?.kind === 'datacenter'
          ? ['clusters', 'hosts', 'vms']
          : ['datacenters', 'clusters', 'hosts', 'vms']
  const activePaneTab = paneTabs.includes(paneTab) ? paneTab : paneTabs[0]
  // Usage gauges (Memory/CPU/Network columns) render only in the hosts grid,
  // so the statistics + per-NIC-statistics read — the heaviest host query the
  // engine offers — stays idle until the Hosts grid is on screen. Its rows
  // merge over the cheap list's below; gauge cells render an em dash until it
  // lands.
  const hostsUsage = useHostsUsage('', { enabled: activePaneTab === 'hosts' })

  // Scoped-VM table column prefs — resolve localized labels through t, same as
  // ClustersPage. Declared before the admin gate so the hook order stays stable.
  const infraVmColumns = useMemo(
    () => VM_LIST_COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const infraVmPrefs = useColumnPrefs('infra-vms', infraVmColumns)
  const infraHostColumns = useMemo(
    () => INFRA_HOST_COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const infraHostPrefs = useColumnPrefs('infra-hosts', infraHostColumns)
  const infraClusterColumns = useMemo(
    () => INFRA_CLUSTER_COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const infraClusterPrefs = useColumnPrefs('infra-clusters', infraClusterColumns)
  const infraDcColumns = useMemo(
    () => INFRA_DATACENTER_COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const infraDcPrefs = useColumnPrefs('infra-datacenters', infraDcColumns)
  // DC pane clusters grid sort — Name ascending mirrors the tree's order
  const clusterSort = useColumnSort({ key: 'name', direction: 'asc' })
  // root pane data-centers grid sort — likewise
  const dcSort = useColumnSort({ key: 'name', direction: 'asc' })

  // One context-menu state for the whole tree: right-clicking a host, cluster,
  // or data center node name opens the matching action menu at the cursor
  // (the root node gets none). A second right-click replaces the open menu, so
  // only one is ever up. Declared before the admin gate so the hook order
  // stays stable.
  const treeMenu = useContextMenu<TreeMenuCtx>()
  // …and one for the scoped-VM table rows — the same right-click twin of the
  // row kebab the VMs & Templates view carries, so the two inventory surfaces
  // behave alike.
  const vmRowMenu = useContextMenu<Vm>()

  // Header sorting, one state per table (the scoped-VM pane and the cluster
  // pane's hosts grid); Name ascending reproduces the old fixed order until a
  // header is clicked.
  const vmSort = useColumnSort({ key: 'name', direction: 'asc' })
  const hostSort = useColumnSort({ key: 'name', direction: 'asc' })
  // a sort change re-orders the whole scoped list — start that pane back at
  // page 1 (one guard per pane, since each pages independently)
  const [prevVmSort, setPrevVmSort] = useState(vmSort.sort)
  if (vmSort.sort !== prevVmSort) {
    setPrevVmSort(vmSort.sort)
    setPage(1)
  }
  const [prevHostSort, setPrevHostSort] = useState(hostSort.sort)
  if (hostSort.sort !== prevHostSort) {
    setPrevHostSort(hostSort.sort)
    setHostPage(1)
  }
  const [prevClusterSort, setPrevClusterSort] = useState(clusterSort.sort)
  if (clusterSort.sort !== prevClusterSort) {
    setPrevClusterSort(clusterSort.sort)
    setClusterPage(1)
  }
  const [prevDcSort, setPrevDcSort] = useState(dcSort.sort)
  if (dcSort.sort !== prevDcSort) {
    setPrevDcSort(dcSort.sort)
    setDcPage(1)
  }

  const dcs = dataCenters.data ?? EMPTY
  const allClusters = clusters.data ?? EMPTY
  const allHosts = hosts.data ?? EMPTY
  const allVms = vms.data ?? EMPTY

  // Id-keyed lookup maps: the join cells and selection resolution run O(1)
  // per row instead of scanning the inventories (O(VMs × hosts) at scale).
  const hostsById = useMemo(() => new Map(allHosts.map((host) => [host.id, host])), [allHosts])
  const clustersById = useMemo(
    () => new Map(allClusters.map((cluster) => [cluster.id, cluster])),
    [allClusters],
  )
  const dcsById = useMemo(() => new Map(dcs.map((dc) => [dc.id, dc])), [dcs])
  const hostsByCluster = useMemo(() => {
    const grouped = new Map<string, Host[]>()
    for (const host of allHosts) {
      if (host.cluster?.id === undefined) continue
      const bucket = grouped.get(host.cluster.id)
      if (bucket) bucket.push(host)
      else grouped.set(host.cluster.id, [host])
    }
    return grouped
  }, [allHosts])

  // VMs per cluster — feeds the clusters grid's VM Count column (the tree
  // itself no longer shows count badges).
  const vmsByCluster = useMemo(() => {
    const byCluster = new Map<string, number>()
    for (const vm of allVms) {
      if (vm.cluster?.id !== undefined)
        byCluster.set(vm.cluster.id, (byCluster.get(vm.cluster.id) ?? 0) + 1)
    }
    return byCluster
  }, [allVms])

  // Client-side tree filter: a cluster/host survives when its own name
  // matches or (for containers) when any descendant matches, so the hierarchy
  // stays walkable while narrowing. Empty needle = everything.
  const needle = filter.trim().toLowerCase()

  // The whole tree is derived data — memoized so poll ticks whose payloads
  // didn't change (structural sharing keeps the array identities) and
  // unrelated state changes skip the rebuild. treeMenu.open is
  // useCallback-stable, so the menus don't churn the memo.
  const treeData = useMemo<TreeViewDataItem[]>(() => {
    const nameMatches = (name: string | undefined) =>
      needle === '' || (name ?? '').toLowerCase().includes(needle)

    const hostItem = (host: Host): TreeViewDataItem => {
      const hostedEngine = host.hosted_engine
      const isHe = hostedEngine?.active === true || hostedEngine?.configured === true
      return {
        id: nodeId('host', host.id),
        // The crown leads the name for hosted-engine hosts (right after the
        // tree's status icon, so the markers align down the tree); ordinary
        // hosts keep the plain string inside the same marked span. The span's
        // data-infra-ctx feeds the tree-level right-click delegation
        // (onTreeContextMenu), so the menu opens from anywhere on the row.
        // The tree's name filter reads host.name directly, so the JSX here
        // never affects search.
        name: isHe ? (
          <span
            data-infra-ctx={nodeId('host', host.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            <HostedEngineCrown hostedEngine={hostedEngine} hostId={host.id} />
            {host.name}
          </span>
        ) : (
          <span data-infra-ctx={nodeId('host', host.id)}>{host.name}</span>
        ),
        icon: <HostTreeIcon status={host.status} />,
      }
    }

    const clusterItem = (cluster: (typeof allClusters)[number]): TreeViewDataItem | null => {
      const allClusterHosts = hostsByCluster.get(cluster.id) ?? []
      const clusterHosts = allClusterHosts
        .filter((host) => nameMatches(cluster.name) || nameMatches(host.name))
        .sort(byName)
      if (!nameMatches(cluster.name) && clusterHosts.length === 0) return null
      return {
        id: nodeId('cluster', cluster.id),
        // The health badge trails the name (leading it would ragged-edge the
        // cluster names against each other) and reads the cluster's *whole*
        // host set, not the name-filtered subset — a filter narrows what you
        // see, it must not talk you out of a warning.
        name: (
          <span
            data-infra-ctx={nodeId('cluster', cluster.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            {cluster.name}
            <ClusterHealthBadge hosts={allClusterHosts} />
          </span>
        ),
        icon: <ClusterIcon />,
        // Collapsed by default (large host estates); auto-open while filtering
        // so search reveals matching hosts inside.
        defaultExpanded: needle !== '',
        children: clusterHosts.length > 0 ? clusterHosts.map(hostItem) : undefined,
      }
    }

    const dcItem = (dc: (typeof dcs)[number]): TreeViewDataItem | null => {
      const dcClusters = allClusters
        .filter((cluster) => cluster.data_center?.id === dc.id)
        .sort(byName)
      const children = dcClusters
        .map(clusterItem)
        .filter((item): item is TreeViewDataItem => item !== null)
      if (!nameMatches(dc.name) && children.length === 0) return null
      return {
        id: nodeId('datacenter', dc.id),
        name: <span data-infra-ctx={nodeId('datacenter', dc.id)}>{dc.name}</span>,
        icon: <InfrastructureIcon />,
        defaultExpanded: needle !== '',
        children: children.length > 0 ? children : undefined,
      }
    }

    return [
      {
        id: ROOT_ID,
        name: t('infra.tree.allLabel'),
        defaultExpanded: true,
        children:
          dcs.length > 0
            ? [...dcs]
                .sort(byName)
                .map(dcItem)
                .filter((item): item is TreeViewDataItem => item !== null)
            : undefined,
      },
    ]
  }, [dcs, allClusters, hostsByCluster, needle, t])

  // Joins for the scoped-VM cells and their sortValue extractors — memoized
  // so the sorted-rows memo below only re-runs when an inventory actually
  // changed, not on every render.
  const infraVmCtx: VmListCtx = useMemo(
    () => ({
      hostName: (id) => (id !== undefined ? hostsById.get(id)?.name : undefined),
      clusterName: (id) => (id !== undefined ? clustersById.get(id)?.name : undefined),
      dataCenter: (clusterId) => {
        const dcId =
          clusterId !== undefined ? clustersById.get(clusterId)?.data_center?.id : undefined
        const dc = dcId !== undefined ? dcsById.get(dcId) : undefined
        return dc !== undefined && dc.name !== undefined ? { id: dc.id, name: dc.name } : undefined
      },
    }),
    [hostsById, clustersById, dcsById],
  )

  // Resolve the concrete entity for the selected kind (undefined once a poll
  // refetch drops it — e.g. a removed cluster — which safely falls back to
  // the all-VMs view).
  const selectedCluster = selection?.kind === 'cluster' ? clustersById.get(selection.id) : undefined
  const selectedHost = selection?.kind === 'host' ? hostsById.get(selection.id) : undefined
  // the host object's cluster ref may be a bare id stub — resolve the display
  // name against the clusters inventory for the header meta line
  const selectedHostClusterName =
    selectedHost?.cluster?.name ??
    (selectedHost?.cluster?.id !== undefined
      ? clustersById.get(selectedHost.cluster.id)?.name
      : undefined)
  // the cluster's data_center ref may be a bare id stub — resolve the display
  // name against the data centers list for the header meta line
  const selectedClusterDcName =
    selectedCluster?.data_center?.name ??
    (selectedCluster?.data_center?.id !== undefined
      ? dcsById.get(selectedCluster.data_center.id)?.name
      : undefined)
  const selectedDc = selection?.kind === 'datacenter' ? dcsById.get(selection.id) : undefined

  // The VM table scope: host by run-on link, DC through its clusters, root (or
  // nothing, or a stale selection) shows all VMs. The cluster branch renders
  // its hosts table instead, so it is not scoped here.
  const scopedVmsUnsorted: Vm[] = useMemo(() => {
    if (selectedHost) return allVms.filter((vm) => vm.host?.id === selectedHost.id)
    if (selectedCluster) return allVms.filter((vm) => vm.cluster?.id === selectedCluster.id)
    if (selectedDc) {
      const clusterIds = new Set(
        allClusters.filter((cluster) => cluster.data_center?.id === selectedDc.id).map((c) => c.id),
      )
      return allVms.filter((vm) => vm.cluster?.id !== undefined && clusterIds.has(vm.cluster.id))
    }
    return allVms
  }, [allVms, allClusters, selectedHost, selectedCluster, selectedDc])

  // Header-sorted once per (rows, sort, inventory) change so the paging below
  // slices a stable order and poll ticks with unchanged payloads skip the
  // re-sort entirely.
  const scopedVms: Vm[] = useMemo(() => {
    const byKey = new Map(infraVmColumns.map((column) => [column.key, column]))
    return sortRows(scopedVmsUnsorted, vmSort.sort, (vm, key) =>
      byKey.get(key)?.sortValue?.({ kind: 'vm', vm }, infraVmCtx),
    )
  }, [scopedVmsUnsorted, vmSort.sort, infraVmColumns, infraVmCtx])

  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what="Hosts & Clusters" />
      </PageSection>
    )
  }

  const infraVisibleColumns = infraVmColumns.filter((column) => infraVmPrefs.isVisible(column.key))

  const infraHostVisibleColumns = infraHostColumns.filter((column) =>
    infraHostPrefs.isVisible(column.key),
  )
  const infraHostCtx: InfraHostColumnCtx = {
    clusterName: (id) => (id !== undefined ? clustersById.get(id)?.name : undefined),
    dataCenter: (clusterId) => {
      const dcId =
        clusterId !== undefined ? clustersById.get(clusterId)?.data_center?.id : undefined
      const dc = dcId !== undefined ? dcsById.get(dcId) : undefined
      return dc !== undefined && dc.name !== undefined ? { id: dc.id, name: dc.name } : undefined
    },
    t,
  }

  // The tree renders as soon as the cheap inventory reads land; the VM pane
  // gates on the VM query alone (inside ScopedVmsPane) — the view no longer
  // waits for the slowest of four collections before showing anything.
  const treePending = dataCenters.isPending || clusters.isPending || hosts.isPending
  const treeError = dataCenters.isError || clusters.isError || hosts.isError
  const treeErrorValue = dataCenters.error ?? clusters.error ?? hosts.error

  // clamp rather than effect-reset — polls can shrink the list underneath
  const lastPage = Math.max(1, Math.ceil(scopedVms.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const pagedVms = scopedVms.slice((currentPage - 1) * perPage, currentPage * perPage)

  // Cluster pane rows: the cheap list's hosts, upgraded in place with the
  // usage read's statistics once it lands (same object shape — the usage row
  // is a superset), so identity/status render immediately and gauges fill in.
  const infraClusterVisibleColumns = infraClusterColumns.filter((column) =>
    infraClusterPrefs.isVisible(column.key),
  )
  const infraClusterCtx: InfraClusterColumnCtx = {
    hostCount: (clusterId) => hostsByCluster.get(clusterId)?.length ?? 0,
    vmCount: (clusterId) => vmsByCluster.get(clusterId) ?? 0,
  }
  // the selected DC's clusters under the grid's header sort
  const dcClusters = selectedDc
    ? sortRows(
        allClusters.filter((cluster) => cluster.data_center?.id === selectedDc.id),
        clusterSort.sort,
        (cluster, key) =>
          infraClusterColumns
            .find((column) => column.key === key)
            ?.sortValue?.(cluster, infraClusterCtx),
      )
    : []

  // Hosts for the current scope — the cluster's, the DC's (across its
  // clusters), or every host at the root — usage-merged (gauges fill in once
  // the lazy statistics read lands) under the grid's header sort.
  const usageById = new Map((hostsUsage.data ?? []).map((host) => [host.id, host]))
  const scopedHostsBase = selectedCluster
    ? (hostsByCluster.get(selectedCluster.id) ?? [])
    : selectedDc
      ? allHosts.filter((host) => {
          const cluster =
            host.cluster?.id !== undefined ? clustersById.get(host.cluster.id) : undefined
          return cluster?.data_center?.id === selectedDc.id
        })
      : allHosts
  const scopedHosts = sortRows(
    scopedHostsBase.map((host) => usageById.get(host.id) ?? host),
    hostSort.sort,
    (host, key) =>
      infraHostColumns.find((column) => column.key === key)?.sortValue?.(host, infraHostCtx),
  )
  // Clusters for the current scope — the DC's (dcClusters, already sorted) or
  // every cluster at the root.
  const scopedClusters = selectedDc
    ? dcClusters
    : sortRows(allClusters, clusterSort.sort, (cluster, key) =>
        infraClusterColumns
          .find((column) => column.key === key)
          ?.sortValue?.(cluster, infraClusterCtx),
      )

  // Per-pane paging — same clamp-don't-reset posture as the VM pane above, so
  // a poll that shrinks a scope can't strand the grid on a dead page.
  const hostLastPage = Math.max(1, Math.ceil(scopedHosts.length / hostPerPage))
  const hostCurrentPage = Math.min(hostPage, hostLastPage)
  const pagedHosts = scopedHosts.slice(
    (hostCurrentPage - 1) * hostPerPage,
    hostCurrentPage * hostPerPage,
  )
  const clusterLastPage = Math.max(1, Math.ceil(scopedClusters.length / clusterPerPage))
  const clusterCurrentPage = Math.min(clusterPage, clusterLastPage)
  const pagedClusters = scopedClusters.slice(
    (clusterCurrentPage - 1) * clusterPerPage,
    clusterCurrentPage * clusterPerPage,
  )
  // Data centers only ever list at the root, so this grid has no scoping to do
  // beyond the header sort.
  const infraDcVisibleColumns = infraDcColumns.filter((column) =>
    infraDcPrefs.isVisible(column.key),
  )
  const sortedDcs = sortRows(dcs, dcSort.sort, (dc, key) =>
    infraDcColumns.find((column) => column.key === key)?.sortValue?.(dc),
  )
  const dcLastPage = Math.max(1, Math.ceil(sortedDcs.length / dcPerPage))
  const dcCurrentPage = Math.min(dcPage, dcLastPage)
  const pagedDcs = sortedDcs.slice((dcCurrentPage - 1) * dcPerPage, dcCurrentPage * dcPerPage)

  // CSV export, one per pane: every row of the current scope (not just the
  // page) × its visible machine-readable columns. sortValue doubles as the
  // export value where a column has one; exportValue covers the columns that
  // render a badge rather than a sortable scalar (Status). Same rule as the
  // VMs & Templates export, so the two views' CSVs agree — see lib/csv.ts for
  // the quoting and formula-injection posture.
  const exportRows = <TRow, TCtx>(
    filename: string,
    columns: {
      label: string
      sortValue?: (row: TRow, ctx: TCtx) => string | number | undefined
      exportValue?: (row: TRow, ctx: TCtx) => string | number | undefined
    }[],
    rows: TRow[],
    ctx: TCtx,
  ) => {
    const exportColumns = columns.filter(
      (column) => column.sortValue !== undefined || column.exportValue !== undefined,
    )
    downloadCsv(
      `${filename}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        exportColumns.map((column) => column.label),
        rows.map((row) =>
          exportColumns.map((column) => (column.exportValue ?? column.sortValue)?.(row, ctx)),
        ),
      ),
    )
  }

  // Right-click delegation for the whole tree: ANYWHERE on a node's row —
  // status icon, VM-count badge, expand toggle, padding — opens its action
  // menu, not just the name text. The name spans carry the kind-namespaced id
  // (data-infra-ctx); the handler re-resolves it against the live inventories
  // so the menu always opens on current data. Unmarked rows (the root) and
  // the space below the tree keep the browser's native menu.
  const onTreeContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isAdmin) return
    const value = treeRowContextValue(event, 'data-infra-ctx')
    const parsed = value === null ? null : parseNodeId(value)
    if (parsed === null) return
    if (parsed.kind === 'host') {
      const host = hostsById.get(parsed.id)
      if (host !== undefined) treeMenu.open(event, { kind: 'host', host })
    } else if (parsed.kind === 'cluster') {
      const cluster = clustersById.get(parsed.id)
      if (cluster !== undefined) treeMenu.open(event, { kind: 'cluster', cluster })
    } else {
      const dataCenter = dcsById.get(parsed.id)
      if (dataCenter !== undefined) treeMenu.open(event, { kind: 'datacenter', dataCenter })
    }
  }

  // Create actions ride the identity banner's right-aligned actions slot, keyed
  // to the SCOPE rather than the active tab, and each level offers exactly the
  // child it can name: a data center makes clusters, a cluster makes hosts, a
  // host makes VMs. The root banner is the deliberate exception — "All
  // infrastructure" is the catch-all, so it keeps all three rather than
  // stranding a create behind a hunt for the right node. Same set as the tree's
  // right-click menus at each level, so the two never drift.
  // They can sit there now because every layer has a banner — the root one
  // included — which is what the old absolute overlay pinned over the tab strip
  // was working around.
  //
  // The button labels reuse the ids the flat /clusters and /hosts lists render,
  // so the two entry points to the same modal can never drift apart.
  const newClusterButton = (
    <Button variant="secondary" onClick={() => setCreatingCluster(true)}>
      {t('clusters.new')}
    </Button>
  )
  const newHostButton = (
    <Button variant="secondary" onClick={() => setCreatingHost(true)}>
      {t('hosts.new')}
    </Button>
  )
  // Add VM owns its own trigger + wizard (CreateVmButton), so unlike the two
  // above it needs no page-level modal state.
  //
  // One expression covers every scope because only a cluster or a host names
  // ONE cluster: a cluster selection is itself, a host selection is its
  // cluster, and the data-center / root scopes span several — where both
  // resolve to undefined and the wizard's Cluster select opens on its
  // placeholder for the user to pick.
  const addVmButton = (
    <CreateVmButton
      variant="secondary"
      label={t('vms.new')}
      initialClusterName={selectedCluster?.name ?? selectedHostClusterName}
    />
  )
  const newInfraButtons = (
    <>
      {newClusterButton}
      {newHostButton}
      {addVmButton}
    </>
  )

  // A tab's label + its scope total. The badge rides the tab's TITLE rather
  // than PF's `actions` slot: actions render as a bare sibling of the tab
  // button inside a stretch-aligned <li>, so the count neither centres against
  // the label nor counts as part of the button you click. Inside the title it
  // is a flex child of .pf-v6-c-tabs__link, which already centres its children
  // and gaps them — and clicking the count selects the tab, as it should.
  // `count` is undefined while a collection is still loading, which drops the
  // badge instead of flashing a 0 that is not the real total.
  const tabTitle = (labelId: MessageId, count: number | undefined) => (
    <>
      <TabTitleText>{t(labelId)}</TabTitleText>
      {count !== undefined && <Badge isRead>{count}</Badge>}
    </>
  )
  // hosts/clusters come from the cheap reads that already gate this pane, so
  // their totals are always truthful; the VM collection lands later.
  const vmBadgeCount = vms.isPending || vms.isError ? undefined : scopedVms.length

  // The scoped-VM pane: scopedVms already resolves per selection (host VMs, a
  // DC's subtree, or every VM at the root). Its PaneToolbar sits above all four
  // of the pane's states, so the chrome holds still while the rows load.
  const vmsPane = (
    <>
      <PaneToolbar
        pagination={{
          itemCount: scopedVms.length,
          page: currentPage,
          perPage,
          onSetPage: setPage,
          onPerPageSelect: (nextPerPage, nextPage) => {
            setPerPage(nextPerPage)
            setPage(nextPage)
          },
          ariaLabelId: 'infra.vms.pagination.ariaLabel',
        }}
        // the shared VM-list columns read the { kind: 'vm' } row shape, not a
        // bare Vm — same wrap the table cells do
        onExportCsv={() =>
          exportRows(
            'vms',
            infraVisibleColumns,
            scopedVms.map((vm): VmListRow => ({ kind: 'vm', vm })),
            infraVmCtx,
          )
        }
        columns={infraVmColumns}
        prefs={infraVmPrefs}
      />
      <ScopedVmsPane
        vmsQuery={vms}
        pagedVms={pagedVms}
        visibleColumns={infraVisibleColumns}
        prefs={infraVmPrefs}
        sort={vmSort}
        ctx={infraVmCtx}
        onRowContextMenu={vmRowMenu.open}
      />
    </>
  )

  return (
    <PageSection>
      {/* The header row is just the title; page-scoped controls (tree toggle,
          filter, refresh) ride the shared tier-1 toolbar and everything that
          targets a grid rides that pane's PaneToolbar. The create modals here
          are the same ones the flat /hosts and /clusters lists mount, which is
          what lets those pages stay out of the nav. */}
      <ListPageHeader title={<FormattedMessage id="infra.title" />} />
      {/* Both mount per open, not persistently: each seeds its draft from the
          scope the banner button was pressed in, and a draft is only seeded on
          mount — a modal kept mounted across selections would hold the scope it
          first saw. Remounting also drops a cancelled form's half-filled state.
          Scope resolves to undefined on the banners that do not offer the
          button (a cluster banner has no New cluster), so these follow the
          selection without a second source of truth. */}
      {creatingCluster && (
        <ClusterFormModal
          isOpen
          initialDataCenterId={selectedDc?.id}
          onClose={() => setCreatingCluster(false)}
        />
      )}
      {creatingHost && (
        <NewHostModal
          isOpen
          initialClusterId={selectedCluster?.id}
          onClose={() => setCreatingHost(false)}
        />
      )}

      <InventoryToolbar
        view="infra"
        isTreeOpen={isTreeOpen}
        onToggleTree={() => setIsTreeOpen((open) => !open)}
        treeToggleLabelIds={{ hide: 'infra.tree.toggle.hide', show: 'infra.tree.toggle.show' }}
        filter={filter}
        onFilterChange={setFilter}
        bookmarkArea="infra"
        hintId="infra.filter.hint"
        ariaLabelId="infra.filter.ariaLabel"
      />

      {treePending && (
        <>
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" screenreaderText={t('infra.loading')} />
        </>
      )}

      {!treePending && treeError && (
        <EmptyState titleText={t('infra.error.title')} status="danger">
          <EmptyStateBody>
            {treeErrorValue instanceof Error ? treeErrorValue.message : 'Unknown error'}
          </EmptyStateBody>
          <Button
            variant="primary"
            onClick={() => {
              void dataCenters.refetch()
              void clusters.refetch()
              void hosts.refetch()
            }}
          >
            <FormattedMessage id="action.retry" />
          </Button>
        </EmptyState>
      )}

      {!treePending && !treeError && dcs.length === 0 && (
        <EmptyState titleText={t('infra.empty.title')}>
          <EmptyStateBody>
            <FormattedMessage id="infra.empty.body" />
          </EmptyStateBody>
        </EmptyState>
      )}

      {!treePending && !treeError && dcs.length > 0 && (
        <Flex
          flexWrap={{ default: 'nowrap' }}
          alignItems={{ default: 'alignItemsStretch' }}
          spaceItems={{ default: 'spaceItemsLg' }}
        >
          {isTreeOpen && (
            <InfraTreePanel
              treeData={treeData}
              filtering={needle !== ''}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onTreeContextMenu={onTreeContextMenu}
            />
          )}
          <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
            {/* Identity banner for the selection, then the per-layer browse
                tabs below it. One chain, not four independent conditions: the
                root banner is the else-branch, so exactly one always renders —
                including for a remembered selection that no longer resolves,
                which falls through to the root scope the VM pane already uses. */}
            {selectedCluster ? (
              // Edit / Upgrade / Remove live on the cluster DETAIL page (Open
              // details, inline by the name). Only New host here — New cluster
              // belongs a level up, New VM a level down.
              <ClusterPaneHeader
                cluster={selectedCluster}
                dcName={selectedClusterDcName}
                actions={newHostButton}
              />
            ) : selectedHost ? (
              // A host holds no clusters, but it does sit IN one — so the only
              // thing creatable from here is a VM, in that cluster. Its kebab
              // follows the button (HostPaneHeader appends it).
              <HostPaneHeader
                host={selectedHost}
                clusterName={selectedHostClusterName}
                actions={addVmButton}
              />
            ) : selectedDc ? (
              // A data center makes clusters; New host / New VM could not name
              // a scope from here anyway (a DC holds many clusters), so they
              // live at the levels that can — and on the root banner.
              <DataCenterPaneHeader dc={selectedDc} actions={newClusterButton} />
            ) : (
              <InfraRootPaneHeader
                dcCount={dcs.length}
                clusterCount={allClusters.length}
                hostCount={allHosts.length}
                vmCount={vms.isPending || vms.isError ? undefined : allVms.length}
                actions={newInfraButtons}
              />
            )}

            {/* The tab strip renders at every layer, including a host leaf —
                where the set is just Virtual machines. A lone tab reads a
                little thin, but it keeps the pane labelled and stops the strip
                (and the grid under it) from jumping as the selection moves
                between a host and its cluster. */}
            <Tabs
              activeKey={activePaneTab}
              onSelect={(_event, key) => setPaneTab(key as PaneTabKey)}
              aria-label={t('infra.tree.ariaLabel')}
              style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
            >
              {paneTabs.includes('datacenters') && (
                <Tab eventKey="datacenters" title={tabTitle('datacenters.title', sortedDcs.length)}>
                  {activePaneTab === 'datacenters' && (
                    <>
                      <PaneToolbar
                        pagination={{
                          itemCount: sortedDcs.length,
                          page: dcCurrentPage,
                          perPage: dcPerPage,
                          onSetPage: setDcPage,
                          onPerPageSelect: (nextPerPage, nextPage) => {
                            setDcPerPage(nextPerPage)
                            setDcPage(nextPage)
                          },
                          ariaLabelId: 'infra.datacenters.pagination.ariaLabel',
                        }}
                        onExportCsv={() =>
                          exportRows('datacenters', infraDcVisibleColumns, sortedDcs, t)
                        }
                        columns={infraDcColumns}
                        prefs={infraDcPrefs}
                      />
                      <ScopedDataCentersSection
                        rows={pagedDcs}
                        visibleColumns={infraDcVisibleColumns}
                        prefs={infraDcPrefs}
                        sort={dcSort}
                        onDrill={(dcId) => setSelectedId(nodeId('datacenter', dcId))}
                        onRowContextMenu={(event, dataCenter) =>
                          treeMenu.open(event, { kind: 'datacenter', dataCenter })
                        }
                      />
                    </>
                  )}
                </Tab>
              )}
              {paneTabs.includes('clusters') && (
                <Tab
                  eventKey="clusters"
                  // the scope's total, not the current page's — the badge
                  // answers "how much is in here?" before you open the tab
                  title={tabTitle('clusters.title', scopedClusters.length)}
                >
                  {activePaneTab === 'clusters' && (
                    <>
                      <PaneToolbar
                        pagination={{
                          itemCount: scopedClusters.length,
                          page: clusterCurrentPage,
                          perPage: clusterPerPage,
                          onSetPage: setClusterPage,
                          onPerPageSelect: (nextPerPage, nextPage) => {
                            setClusterPerPage(nextPerPage)
                            setClusterPage(nextPage)
                          },
                          ariaLabelId: 'infra.clusters.pagination.ariaLabel',
                        }}
                        onExportCsv={() =>
                          exportRows(
                            'clusters',
                            infraClusterVisibleColumns,
                            scopedClusters,
                            infraClusterCtx,
                          )
                        }
                        columns={infraClusterColumns}
                        prefs={infraClusterPrefs}
                      />
                      <ScopedClustersSection
                        rows={pagedClusters}
                        visibleColumns={infraClusterVisibleColumns}
                        prefs={infraClusterPrefs}
                        sort={clusterSort}
                        ctx={infraClusterCtx}
                        onDrill={(clusterId) => setSelectedId(nodeId('cluster', clusterId))}
                        onRowContextMenu={(event, cluster) =>
                          treeMenu.open(event, { kind: 'cluster', cluster })
                        }
                      />
                    </>
                  )}
                </Tab>
              )}
              {paneTabs.includes('hosts') && (
                <Tab eventKey="hosts" title={tabTitle('hosts.title', scopedHosts.length)}>
                  {activePaneTab === 'hosts' && (
                    <>
                      <PaneToolbar
                        pagination={{
                          itemCount: scopedHosts.length,
                          page: hostCurrentPage,
                          perPage: hostPerPage,
                          onSetPage: setHostPage,
                          onPerPageSelect: (nextPerPage, nextPage) => {
                            setHostPerPage(nextPerPage)
                            setHostPage(nextPage)
                          },
                          ariaLabelId: 'infra.hosts.pagination.ariaLabel',
                        }}
                        onExportCsv={() =>
                          exportRows('hosts', infraHostVisibleColumns, scopedHosts, infraHostCtx)
                        }
                        columns={infraHostColumns}
                        prefs={infraHostPrefs}
                      />
                      <ScopedHostsSection
                        rows={pagedHosts}
                        visibleColumns={infraHostVisibleColumns}
                        prefs={infraHostPrefs}
                        sort={hostSort}
                        ctx={infraHostCtx}
                      />
                    </>
                  )}
                </Tab>
              )}
              <Tab eventKey="vms" title={tabTitle('vms.title', vmBadgeCount)}>
                {activePaneTab === 'vms' && vmsPane}
              </Tab>
            </Tabs>
          </FlexItem>
        </Flex>
      )}

      <InfraTreeMenu
        target={treeMenu.target}
        allHosts={allHosts}
        allClusters={allClusters}
        dcs={dcs}
        onClose={treeMenu.close}
        onEntityRemoved={(node) => {
          if (selectedId === node) setSelectedId(null)
        }}
      />

      {/* Right-click twin of the scoped-VM row kebabs, keyed by token so
          re-opening remounts fresh at the new cursor position. */}
      {vmRowMenu.target !== null && (
        <VmActionsMenu
          key={`${vmRowMenu.target.ctx.id}-${vmRowMenu.target.token}`}
          vm={vmRowMenu.target.ctx}
          includeMigrate
          contextMenu={{ position: vmRowMenu.target.position, onClose: vmRowMenu.close }}
        />
      )}
    </PageSection>
  )
}
