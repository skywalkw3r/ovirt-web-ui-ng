import type { PaneColumn } from '../../pages/hosts-clusters/usePaneTable'

// Live client-side filter for the cluster detail's VM and host grids: the rows
// are already in memory (the shared /vms and /hosts reads), so it applies per
// keystroke. The haystack is every column's string sortValue — name, host,
// FQDN, address, description, comment — the vm-membership search's rule:
// numeric values (bytes, percentages) stay out so digit queries don't match
// raw counts nobody sees, and status chips carry no sortValue by design.
export function paneRowMatches<Row, Ctx>(
  row: Row,
  columns: readonly PaneColumn<Row, Ctx>[],
  ctx: Ctx,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return columns.some((column) => {
    const value = column.sortValue?.(row, ctx)
    return typeof value === 'string' && value.toLowerCase().includes(needle)
  })
}
