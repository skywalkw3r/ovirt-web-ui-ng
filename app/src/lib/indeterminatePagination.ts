// Server-side pagination without a grand total. The oVirt events collection
// pages the audit log server-side (search `page N` windows) but never reports
// how many rows exist overall. PatternFly's <Pagination> derives its prev/next
// disabled state and range display from itemCount, so we feed it a *synthetic*
// count: the rows seen so far, claiming one extra item while the current
// window came back full. That keeps "next" enabled until a short (final) page
// arrives, then disables it — indeterminate paging with no fake total shown
// (the caller renders only the row range via toggleTemplate).
//
// page is 1-based; rowCount is the number of rows in the CURRENT page.
export function indeterminateItemCount(page: number, perPage: number, rowCount: number): number {
  const seen = (page - 1) * perPage + rowCount
  // a full window implies at least one more row beyond it
  return rowCount === perPage ? seen + 1 : seen
}

// True while another page is presumed to exist — i.e. the current window came
// back full. Mirrors how <Pagination> reads indeterminateItemCount; exported
// for call sites (and tests) that want the boolean directly.
export function hasNextPage(perPage: number, rowCount: number): boolean {
  return rowCount === perPage
}
