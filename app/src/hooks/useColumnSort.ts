import { useState } from 'react'
import type { ThProps } from '@patternfly/react-table'

// Client-side header sorting for the COLUMNS-array tables. Column defs opt in
// by carrying a sortValue extractor; the hook owns the active {key, direction}
// and builds the PF `Th sort` prop (PF renders the header button, the
// direction arrow, and aria-sort — no extra i18n strings needed). Composes
// with ResizableTh, which spreads ThProps through to Th; the resize handle
// rides additionalContent, outside the sort button.
//
// Sort state is keyed by column KEY, not index, so it survives the column
// picker hiding/showing columns; it is view-local and session-only on purpose
// — unlike widths/visibility it is a transient reading aid, so it resets with
// the page, matching webadmin.

export type SortDirection = 'asc' | 'desc'

export interface ColumnSort {
  key: string
  direction: SortDirection
}

export function useColumnSort(defaultSort: ColumnSort | null = null): {
  sort: ColumnSort | null
  // The Th `sort` prop for the visible column at columnIndex. PF matches the
  // active column by index, so pass the same visible-key array the headers
  // map over (hidden columns excluded).
  thSort: (visibleKeys: readonly string[], columnIndex: number) => ThProps['sort']
} {
  const [sort, setSort] = useState<ColumnSort | null>(defaultSort)

  const thSort = (visibleKeys: readonly string[], columnIndex: number): ThProps['sort'] => {
    const activeIndex = sort === null ? -1 : visibleKeys.indexOf(sort.key)
    return {
      columnIndex,
      // an empty sortBy renders every header inactive (no arrow) when the
      // active column is hidden or nothing has been clicked yet
      sortBy:
        activeIndex >= 0 && sort !== null ? { index: activeIndex, direction: sort.direction } : {},
      onSort: (_event, index, direction) => {
        const key = visibleKeys[index]
        if (key !== undefined) setSort({ key, direction })
      },
    }
  }

  return { sort, thSort }
}

// Rows with no value (unresolved join, absent gauge, template in a VM-only
// column) sink to the END in both directions, so a half-loaded column never
// leads the table with em dashes.
const isMissing = (value: unknown): boolean => value === undefined || value === null || value === ''

// numeric:true so host-2 sorts before host-10; base sensitivity for
// case-insensitive name ordering consistent with the previous localeCompare
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Numbers compare numerically, everything else through the collator.
// Exported for the unit tests.
export function compareSortValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

// Stable-ish sorted copy of rows under the active sort; the input order is
// the tiebreak (Array.prototype.sort is stable), so equal keys keep the
// caller's baseline ordering. A null sort returns the rows untouched.
export function sortRows<T>(
  rows: readonly T[],
  sort: ColumnSort | null,
  valueOf: (row: T, key: string) => unknown,
): T[] {
  if (sort === null) return [...rows]
  const sign = sort.direction === 'desc' ? -1 : 1
  return [...rows].sort((x, y) => {
    const a = valueOf(x, sort.key)
    const b = valueOf(y, sort.key)
    const aMissing = isMissing(a)
    const bMissing = isMissing(b)
    if (aMissing || bMissing) return aMissing && bMissing ? 0 : aMissing ? 1 : -1
    return sign * compareSortValues(a, b)
  })
}
