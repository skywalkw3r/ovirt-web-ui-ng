import { describe, expect, it } from 'vitest'
import { hasNextPage, indeterminateItemCount } from './indeterminatePagination'

// The synthetic itemCount feeds PF <Pagination> on server-paged collections
// that report no grand total (events). The contract: claim exactly one row
// beyond the rows seen while the current window is full — "next" stays
// enabled — and exactly the rows seen once a short window arrives — "next"
// disables and the count stops moving.
describe('indeterminateItemCount', () => {
  it('claims one extra item while the current window is full', () => {
    // page 1 of 50, full: 50 seen, so PF must believe a page 2 exists
    expect(indeterminateItemCount(1, 50, 50)).toBe(51)
    // page 3 of 50, full: 150 seen + the presumed next row
    expect(indeterminateItemCount(3, 50, 50)).toBe(151)
  })

  it('settles on the exact count when a short (final) window arrives', () => {
    // page 4 of 50 came back with 2 rows → 152 total, next disables
    expect(indeterminateItemCount(4, 50, 2)).toBe(152)
    // a short first page is the whole collection
    expect(indeterminateItemCount(1, 50, 17)).toBe(17)
  })

  it('handles an empty window (beyond-the-end page) without going negative', () => {
    expect(indeterminateItemCount(1, 50, 0)).toBe(0)
    // page 2 empty: the count collapses to the 50 rows behind it
    expect(indeterminateItemCount(2, 50, 0)).toBe(50)
  })
})

describe('hasNextPage', () => {
  it('presumes another page exactly while the window is full', () => {
    expect(hasNextPage(50, 50)).toBe(true)
    expect(hasNextPage(50, 49)).toBe(false)
    expect(hasNextPage(50, 0)).toBe(false)
  })
})
