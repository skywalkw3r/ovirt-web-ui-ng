import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { LayerGroupIcon, VirtualMachineIcon } from '@patternfly/react-icons'
import type { Template } from '../api/schemas/template'
import type { Vm } from '../api/schemas/vm'
import { followedTagsOf } from '../hooks/useTags'
import type { MessageId } from '../i18n/messages/en'
import { formatBytes, formatUptime, vmUptimeSeconds } from '../lib/format'
import { VmLabels } from './tags/VmLabels'
import { TemplateStatusLabel } from './TemplateStatusLabel'
import { VmStatusLabel } from './VmStatusLabel'
import { VmWarnings } from './VmWarnings'

// The single VM-list column catalog. The VMs & Templates inventory view and
// the Hosts & Clusters scoped-VM table both render from this array so the
// picker set, the default-visible layout, and the column order can never
// drift between the two surfaces (each keeps its own useColumnPrefs area, so
// per-view visibility tweaks stay independent).
//
// One normalized row per entity: the inventory view mixes VMs and templates
// under the folder tree; the infra view wraps its pure-VM rows in the same
// shape. Fixed relative widths + per-cell truncation keep every row a single
// line: PF's truncate modifier is the max-width:1px + width% trick, so the
// free-text columns (Name generous, Description remainder) get both, and the
// narrow structured columns stay nowrap.
export type VmListRow = { kind: 'vm'; vm: Vm } | { kind: 'template'; template: Template }

export const rowEntity = (row: VmListRow): Vm | Template =>
  row.kind === 'vm' ? row.vm : row.template

// Host/cluster/DC names come from client-side joins against the cached
// inventories (rows carry id-only links; the DC join resolves the full ref so
// its cell can link through). The join queries are admin-gated, so user-tier
// sessions see an em dash — those columns start hidden anyway.
export interface VmListCtx {
  hostName: (id: string | undefined) => string | undefined
  clusterName: (id: string | undefined) => string | undefined
  dataCenter: (clusterId: string | undefined) => { id: string; name: string } | undefined
}

export interface VmListColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  width?: 10 | 15 | 25
  modifier?: 'nowrap' | 'truncate'
  // free-text columns carry a native title so the truncated text is legible on
  // hover; structured columns leave it undefined
  title?: (row: VmListRow) => string | undefined
  // opt-in header sort: extract the comparable value for this column (see
  // hooks/useColumnSort — missing values sink to the end in both directions)
  sortValue?: (row: VmListRow, ctx: VmListCtx) => string | number | undefined
  // What the CSV export writes for this column. Takes precedence over
  // sortValue, which the export otherwise falls back to.
  //
  // Needed in two cases: a column with no header sort at all (status), and a
  // column whose sortValue is a RAW machine number that must stay raw to sort
  // correctly but is unreadable in a spreadsheet — memory in bytes, uptime in
  // seconds, creation time in epoch millis (which Excel renders as
  // 1.78367E+12). Those export the same string the cell renders. Return
  // undefined for "no value" so the cell is empty rather than an em dash.
  exportValue?: (row: VmListRow, ctx: VmListCtx) => string | number | undefined
  cell: (row: VmListRow, ctx: VmListCtx) => ReactNode
}

// vCPUs = sockets × cores × threads, legs defaulting to 1 like the engine
function vcpuCount(entity: Vm | Template): number | undefined {
  const topology = entity.cpu?.topology
  if (!topology) return undefined
  return (topology.sockets ?? 1) * (topology.cores ?? 1) * (topology.threads ?? 1)
}

export const VM_LIST_COLUMNS: VmListColumn[] = [
  {
    key: 'status',
    labelId: 'inventory.column.status',
    exportValue: (row) => (row.kind === 'vm' ? row.vm.status : row.template.status),
    modifier: 'nowrap',
    cell: (row) =>
      row.kind === 'vm' ? (
        <>
          <VmStatusLabel status={row.vm.status} />
          <VmWarnings vm={row.vm} />
        </>
      ) : (
        <TemplateStatusLabel status={row.template.status} />
      ),
  },
  {
    key: 'name',
    labelId: 'inventory.column.name',
    sortValue: (row) => rowEntity(row).name,
    always: true,
    width: 25,
    modifier: 'truncate',
    title: (row) => rowEntity(row).name,
    cell: (row) => {
      const entity = rowEntity(row)
      // A muted kind glyph in front of the name so mixed VM/template tables
      // read at a glance even with the Type column hidden (PF icons render
      // aria-hidden; the Type column stays the accessible/textual kind).
      const KindIcon = row.kind === 'vm' ? VirtualMachineIcon : LayerGroupIcon
      return (
        <>
          <KindIcon
            style={{
              flexShrink: 0,
              marginRight: 'var(--pf-t--global--spacer--sm)',
              verticalAlign: '-0.125em',
              color: 'var(--pf-t--global--icon--color--subtle)',
            }}
          />
          {row.kind === 'vm' ? (
            <Link to="/vms/$vmId" params={{ vmId: entity.id }}>
              {entity.name}
            </Link>
          ) : (
            <Link to="/templates/$templateId" params={{ templateId: entity.id }}>
              {entity.name}
            </Link>
          )}
        </>
      )
    },
  },
  {
    key: 'labels',
    labelId: 'inventory.column.labels',
    defaultHidden: true,
    width: 15,
    modifier: 'nowrap',
    cell: (row) => {
      const entity = rowEntity(row)
      const entityTags = followedTagsOf(entity)
      // VMs keep the per-VM query fallback; template rows only render chips when
      // the list read embedded the tags (a per-template fallback would hit the
      // wrong endpoint)
      if (row.kind === 'vm') return <VmLabels vmId={entity.id} tags={entityTags} />
      return entityTags !== undefined ? <VmLabels vmId={entity.id} tags={entityTags} /> : '—'
    },
  },
  // Legacy-grid parity columns (old portal's picker set), all opt-in via the
  // picker so the curated default view stays tight. IP Addresses, live CPU/
  // Network % and K8s Namespace are deliberately excluded (guest-agent reads,
  // N×poll statistics, kubevirt-only).
  {
    key: 'comment',
    labelId: 'vms.column.comment',
    sortValue: (row) => rowEntity(row).comment || undefined,
    defaultHidden: true,
    modifier: 'truncate',
    title: (row) => rowEntity(row).comment ?? undefined,
    cell: (row) => rowEntity(row).comment || '—',
  },
  {
    key: 'host',
    labelId: 'vms.column.host',
    sortValue: (row, ctx) => (row.kind === 'vm' ? ctx.hostName(row.vm.host?.id) : undefined),
    modifier: 'nowrap',
    // Link through to the host detail page when the id/name join resolves
    // (admin-tier only; user tier and unresolved joins fall back to a dash).
    cell: (row, ctx) => {
      if (row.kind !== 'vm') return '—'
      const id = row.vm.host?.id
      const name = ctx.hostName(id)
      if (id === undefined || name === undefined) return '—'
      return (
        <Link to="/hosts/$hostId" params={{ hostId: id }}>
          {name}
        </Link>
      )
    },
  },
  {
    key: 'cluster',
    labelId: 'vms.column.cluster',
    sortValue: (row, ctx) => ctx.clusterName(rowEntity(row).cluster?.id),
    modifier: 'nowrap',
    // Link through to the cluster detail page when the id/name join resolves.
    cell: (row, ctx) => {
      const id = rowEntity(row).cluster?.id
      const name = ctx.clusterName(id)
      if (id === undefined || name === undefined) return '—'
      return (
        <Link to="/clusters/$clusterId" params={{ clusterId: id }}>
          {name}
        </Link>
      )
    },
  },
  {
    key: 'datacenter',
    labelId: 'vms.column.datacenter',
    sortValue: (row, ctx) => ctx.dataCenter(rowEntity(row).cluster?.id)?.name,
    defaultHidden: true,
    modifier: 'nowrap',
    // Link through to the data center detail page when the cluster→DC join
    // resolves.
    cell: (row, ctx) => {
      const dc = ctx.dataCenter(rowEntity(row).cluster?.id)
      if (dc === undefined) return '—'
      return (
        <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dc.id }}>
          {dc.name}
        </Link>
      )
    },
  },
  {
    key: 'memory',
    labelId: 'vms.column.memory',
    // raw bytes sort correctly; "2 GiB" exports readably
    sortValue: (row) => rowEntity(row).memory,
    exportValue: (row) => {
      const memory = rowEntity(row).memory
      return memory !== undefined ? formatBytes(memory) : undefined
    },
    defaultHidden: true,
    modifier: 'nowrap',
    cell: (row) => formatBytes(rowEntity(row).memory),
  },
  {
    key: 'vcpus',
    labelId: 'vms.column.vcpus',
    sortValue: (row) => vcpuCount(rowEntity(row)),
    defaultHidden: true,
    modifier: 'nowrap',
    cell: (row) => vcpuCount(rowEntity(row)) ?? '—',
  },
  {
    key: 'graphics',
    labelId: 'vms.column.graphics',
    sortValue: (row) => (row.kind === 'vm' ? row.vm.display?.type : undefined),
    defaultHidden: true,
    modifier: 'nowrap',
    cell: (row) =>
      row.kind === 'vm' && row.vm.display?.type ? row.vm.display.type.toUpperCase() : '—',
  },
  {
    key: 'uptime',
    labelId: 'vms.column.uptime',
    sortValue: (row) =>
      row.kind === 'vm' && row.vm.status === 'up' ? vmUptimeSeconds(row.vm) : undefined,
    // seconds sort correctly; "4d 6h 12m" exports readably. Not formatUptime()
    // straight off sortValue: that renders an em dash for a missing value,
    // which is table furniture, not data.
    exportValue: (row) => {
      if (row.kind !== 'vm' || row.vm.status !== 'up') return undefined
      const seconds = vmUptimeSeconds(row.vm)
      return seconds !== undefined ? formatUptime(seconds) : undefined
    },
    modifier: 'nowrap',
    // elapsed.time statistic (seconds since the current run booted) — NOT
    // start_time, which the engine pins at creation/import; see vmUptimeSeconds
    cell: (row) =>
      row.kind === 'vm' && row.vm.status === 'up' ? formatUptime(vmUptimeSeconds(row.vm)) : '—',
  },
  {
    key: 'created',
    labelId: 'vms.column.created',
    sortValue: (row) => rowEntity(row).creation_time,
    // Epoch millis sort correctly but a spreadsheet renders them as
    // 1.78367E+12. ISO 8601 rather than the cell's toLocaleDateString: an
    // export outlives the session that made it and gets mailed around, so
    // 15/06 vs 06/15 must not depend on who opens it — and ISO still sorts
    // chronologically as plain text. It also keeps the time of day, which the
    // cell drops for width.
    exportValue: (row) => {
      const created = rowEntity(row).creation_time
      return created !== undefined ? new Date(created).toISOString() : undefined
    },
    defaultHidden: true,
    modifier: 'nowrap',
    cell: (row) => {
      const created = rowEntity(row).creation_time
      return created !== undefined ? new Date(created).toLocaleDateString() : '—'
    },
  },
  {
    key: 'fqdn',
    labelId: 'vms.column.fqdn',
    sortValue: (row) => (row.kind === 'vm' ? row.vm.fqdn : undefined),
    defaultHidden: true,
    modifier: 'truncate',
    title: (row) => (row.kind === 'vm' ? row.vm.fqdn : undefined),
    cell: (row) => (row.kind === 'vm' ? (row.vm.fqdn ?? '—') : '—'),
  },
  {
    key: 'description',
    labelId: 'inventory.column.description',
    sortValue: (row) => rowEntity(row).description || undefined,
    width: 25,
    modifier: 'truncate',
    title: (row) => rowEntity(row).description || undefined,
    cell: (row) => rowEntity(row).description || '—',
  },
]
