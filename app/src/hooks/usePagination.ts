import { useState } from 'react'

// One pagination state for a client-side paged list — the page/perPage pair
// every list page used to hand-roll, with the two semantics they all shared:
//
// - Clamp, don't effect-reset. Polling refetches (and filters) can shrink the
//   list underneath the current page, so the reported `page` is clamped to the
//   last non-empty page of `total` at read time rather than reset in an effect
//   (which would flash the dead page for a frame). The stored page is left
//   alone, so a list that grows back lands on the page the user picked.
// - A new committed search / filter / sort starts back at page 1. Pass those
//   values in `resetKeys` — compared element-wise with Object.is, like an
//   effect deps array, so an object such as a ColumnSort compares by identity —
//   and the page resets during render the moment one changes (React's
//   render-time state adjustment: no extra render with the stale page).
//
// `total` is optional for server-side paging without a grand total (the Events
// audit log): there the stored page is returned unclamped and the caller owns
// any step-back logic.
//
// Returned shape:
//   page / perPage              the (clamped) current page and the page size
//   setPage / setPerPage        raw setters
//   onSetPage / onPerPageSelect PF <Pagination> handlers (event-first signature)
//   selectPerPage               PaneToolbar's (perPage, page) handler
//   pageSlice(rows)             the current page of rows
//   perPageOptions              PER_PAGE_OPTIONS, for <Pagination perPageOptions>

export const DEFAULT_PER_PAGE = 50

// Page sizes every list offers.
export const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

export interface PaginationState {
  page: number
  perPage: number
  setPage: (page: number) => void
  setPerPage: (perPage: number) => void
  onSetPage: (_event: unknown, page: number) => void
  onPerPageSelect: (_event: unknown, perPage: number, page: number) => void
  selectPerPage: (perPage: number, page: number) => void
  pageSlice: <T>(rows: readonly T[]) => T[]
  perPageOptions: typeof PER_PAGE_OPTIONS
}

// --- pure core (unit-tested; the hook is a thin stateful wrapper) -----------

// the last page that still holds a row; an empty list still has page 1
export function lastPageOf(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage))
}

export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(page, lastPageOf(total, perPage))
}

export function paginate<T>(rows: readonly T[], page: number, perPage: number): T[] {
  return rows.slice((page - 1) * perPage, page * perPage)
}

// element-wise Object.is — the same equality an effect deps array gets
export function resetKeysChanged(previous: readonly unknown[], next: readonly unknown[]): boolean {
  return (
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]))
  )
}

// --- hook -------------------------------------------------------------------

export function usePagination({
  total,
  resetKeys = [],
}: {
  total?: number
  resetKeys?: readonly unknown[]
} = {}): PaginationState {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE)

  // a changed reset key starts back at page 1 (guarded setState during render)
  const [prevResetKeys, setPrevResetKeys] = useState(resetKeys)
  if (resetKeysChanged(prevResetKeys, resetKeys)) {
    setPrevResetKeys(resetKeys)
    setPage(1)
  }

  const currentPage = total === undefined ? page : clampPage(page, total, perPage)
  const selectPerPage = (nextPerPage: number, nextPage: number) => {
    setPerPage(nextPerPage)
    setPage(nextPage)
  }

  return {
    page: currentPage,
    perPage,
    setPage,
    setPerPage,
    onSetPage: (_event, nextPage) => setPage(nextPage),
    onPerPageSelect: (_event, nextPerPage, nextPage) => selectPerPage(nextPerPage, nextPage),
    selectPerPage,
    pageSlice: <T>(rows: readonly T[]): T[] => paginate(rows, currentPage, perPage),
    perPageOptions: PER_PAGE_OPTIONS,
  }
}
