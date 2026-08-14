import type { Vm } from '../../api/schemas/vm'
import type { VmMembershipColumn } from './columns'

// Live client-side filter for the "VMs of <parent>" tabs. The membership list
// is already in memory (useVmMembership filters the shared /vms feed), so it
// applies per keystroke rather than round-tripping the engine search DSL —
// PermissionsPanel's permissionMatchesSearch idiom, generalised over the
// caller's column defs.
//
// The haystack is the row's NAME plus whatever text its columns already expose
// for sorting and hover: a column's string sortValue (description, cluster
// name) and its truncate `title`. Numeric sortValues (defined memory, vCPUs)
// stay out — a raw byte count would match digit queries nobody aimed at it —
// and Status carries no sortValue by design (a state chip is not scannable
// text). Only the columns passed in are searched, so a column hidden by the
// picker stops contributing matches the user cannot see.
export function vmMatchesSearch(query: string, vm: Vm, columns: VmMembershipColumn[]): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  if (vm.name.toLowerCase().includes(needle)) return true
  return columns.some((column) => {
    const sortValue = column.sortValue?.(vm)
    if (typeof sortValue === 'string' && sortValue.toLowerCase().includes(needle)) return true
    const title = column.title?.(vm)
    return title !== undefined && title.toLowerCase().includes(needle)
  })
}
