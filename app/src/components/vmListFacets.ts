import type { FacetDef } from '../lib/facets'
import { statusText } from '../lib/format'
import { statusLabel, VM_STATUSES } from '../lib/vm-status'
import type { MessageId } from '../i18n/messages/en'
import { rowEntity, type VmListCtx, type VmListRow } from './vmListColumns'

// The facet catalog for VM/template lists — the filter twin of
// VM_LIST_COLUMNS, and deliberately a sibling file rather than extra fields
// on the column defs: a facet is not per-column (Cluster filters by id while
// its column renders a link and sorts by name), and useful facets exist for
// columns that start hidden. Everything here filters CLIENT-side over the
// already-fetched collection, which is what the folder tree and name filter
// already do on this surface.
//
// Values are stable keys — entity ids and engine enums, never display names,
// which are renamable and localized. They ride the URL (useFacetFilters), so
// a filtered view is a shareable link.
// Extends the column ctx rather than widening it: the column contract is
// shared with the Hosts & Clusters VM table, and these two extras are only
// ever needed to LABEL an option — VmListCtx.dataCenter resolves a DC from a
// cluster id, which says nothing about how to name the id already in a chip.
export interface VmListFacetCtx extends VmListCtx {
  t: (id: MessageId) => string
  dataCenterName: (id: string) => string | undefined
}

export interface VmListFacet extends FacetDef<VmListRow, VmListFacetCtx> {
  labelId: MessageId
}

// VM statuses first in the engine's own progression (Running before Powered
// off before the transitional states), then the template statuses — the
// mixed table's status column reads from both enums and they don't collide.
const TEMPLATE_STATUSES = ['ok', 'locked', 'illegal'] as const
const STATUS_ORDER: readonly string[] = [...VM_STATUSES, ...TEMPLATE_STATUSES]

// 'ok' reads as an initialism, everything else humanizes ('image_locked' →
// 'Image locked'); VM statuses route through statusLabel first so 'up'/'down'
// show as Running/Powered off exactly like the status column's badges.
const statusOptionLabel = (value: string): string =>
  value === 'ok'
    ? 'OK'
    : statusText((VM_STATUSES as readonly string[]).includes(value) ? statusLabel(value) : value)

export const VM_LIST_FACETS: VmListFacet[] = [
  {
    key: 'status',
    labelId: 'inventory.column.status',
    order: STATUS_ORDER,
    valuesOf: (row) => {
      const status = row.kind === 'vm' ? row.vm.status : row.template.status
      return status === undefined ? [] : [status]
    },
    labelOf: statusOptionLabel,
  },
  {
    key: 'type',
    labelId: 'inventory.column.type',
    order: ['vm', 'template'],
    valuesOf: (row) => [row.kind],
    labelOf: (value, ctx) =>
      ctx.t(value === 'vm' ? 'inventory.kind.vm' : 'inventory.kind.template'),
  },
  {
    key: 'cluster',
    labelId: 'vms.column.cluster',
    valuesOf: (row) => {
      const id = rowEntity(row).cluster?.id
      return id === undefined ? [] : [id]
    },
    // The joins are admin-gated inventories: before they land (or on a
    // user-tier session) the id is all there is, so the option labels itself
    // with the id rather than vanishing.
    labelOf: (value, ctx) => ctx.clusterName(value) ?? value,
  },
  {
    key: 'datacenter',
    labelId: 'vms.column.datacenter',
    valuesOf: (row, ctx) => {
      const dc = ctx.dataCenter(rowEntity(row).cluster?.id)
      return dc === undefined ? [] : [dc.id]
    },
    labelOf: (value, ctx) => ctx.dataCenterName(value) ?? value,
  },
  // No Host facet: only running VMs carry a host, so it filters a slice of
  // one status and reads as broken on the rest (every template and every
  // stopped VM drops out). "What is on node-01?" is the host detail page's
  // VMs tab — the inventory's facets stay attributes every row can answer.
]
