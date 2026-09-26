import { Link } from '@tanstack/react-router'
import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import { HostedEngineCrown } from '../../components/HostedEngineCrown'
import { HostStatusCell, UsageBar, VmCountCell } from '../../components/HostListCells'
import { StatusBadge } from '../../components/StatusBadge'
import type { useT } from '../../i18n/useT'
import { formatBytes, hostSpmText, statusText } from '../../lib/format'
import { hostGauges, hostNetworkPercent } from '../../lib/utilization'
import { compatString } from './infraModel'
import type { PaneColumn } from './usePaneTable'

// The column catalogs of the three infra-owned grids on the Hosts & Clusters
// view. (The scoped-VM grid renders the shared VM-list catalog, vmListColumns
// — the same picker set, defaults, and order as the VMs & Templates view, so
// the two inventory surfaces never drift.)

export type Translate = ReturnType<typeof useT>

// Legacy webadmin hosts-grid parity for the cluster pane (area 'infra-hosts'):
// the flat /hosts page's column set re-defaulted for cluster scope — the
// utilization gauges stay on; the locating joins (Cluster / Data Center) and
// Hostname/IP ship opt-in, because the tree selection already locates the row
// and webadmin itself defaults Hostname/IP off. Cluster/DC names resolve via
// client-side joins over the cached inventories, passed through ctx so the
// cells stay pure.
export interface InfraHostColumnCtx {
  clusterName: (id: string | undefined) => string | undefined
  dataCenter: (clusterId: string | undefined) => { id: string; name: string } | undefined
  t: Translate
}

export const INFRA_HOST_COLUMNS: PaneColumn<Host, InfraHostColumnCtx>[] = [
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

// Same coloring policy as the flat /datacenters page: only the two states an
// admin acts on routinely get a signal, everything else stays grey.
function dataCenterStatusCell(status: string | undefined) {
  if (!status) return '—'
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
export const INFRA_DATACENTER_COLUMNS: PaneColumn<DataCenter, Translate>[] = [
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
    cell: (dc) => dataCenterStatusCell(dc.status),
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
export interface InfraClusterColumnCtx {
  hostCount: (clusterId: string) => number
  vmCount: (clusterId: string) => number
}

export const INFRA_CLUSTER_COLUMNS: PaneColumn<Cluster, InfraClusterColumnCtx>[] = [
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
