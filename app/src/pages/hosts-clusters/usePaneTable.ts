import { useMemo, type ReactNode } from 'react'
import { useColumnPrefs, type ColumnPrefs } from '../../hooks/useColumnPrefs'
import { sortRows, useColumnSort, type ColumnSort } from '../../hooks/useColumnSort'
import { usePagination, type PaginationState } from '../../hooks/usePagination'
import type { PaneToolbarPagination } from '../../components/list-toolbar/PaneToolbar'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { downloadCsv, toCsv } from '../../lib/csv'

// One grid's table state on the Hosts & Clusters view: its localized column
// catalog + picker prefs (persisted per area), header sort, the scope rows
// under that sort, and their paging. The page calls this once per pane and
// hands the result to the pane component, because the panes unmount on every
// tab switch (and the VM pane moves between render positions) — any
// sort/paging state they held would silently reset. The panes themselves stay
// presentational.

// The column shape every infra grid renders from — the shared VM-list catalog
// (vmListColumns) satisfies it structurally, so the scoped-VM table rides the
// same code path as the hosts / clusters / data-centers grids.
export interface PaneColumn<Row, Ctx> {
  key: string
  labelId: MessageId
  // always-visible identity columns (Name) can never be hidden
  always?: boolean
  // starts unchecked when the user has no saved preference (and after Reset)
  defaultHidden?: boolean
  // PF preset percent width, honored only while the grid is still fluid
  width?: 10 | 15 | 25
  // free-text columns single-line: truncate + a native title on the cell
  modifier?: 'nowrap' | 'truncate'
  title?: (row: Row) => string | undefined
  // opt-in header sort (see hooks/useColumnSort); doubles as the CSV value
  sortValue?: (row: Row, ctx: Ctx) => string | number | undefined
  // CSV value for columns that render a badge rather than a sortable scalar
  exportValue?: (row: Row, ctx: Ctx) => string | number | undefined
  cell: (row: Row, ctx: Ctx) => ReactNode
}

export type LabeledPaneColumn<Row, Ctx> = PaneColumn<Row, Ctx> & { label: string }

export type SortHandle = ReturnType<typeof useColumnSort>

export interface PaneTable<Row, Ctx> {
  columns: LabeledPaneColumn<Row, Ctx>[]
  visibleColumns: LabeledPaneColumn<Row, Ctx>[]
  prefs: ColumnPrefs
  sort: SortHandle
  // every row of the current scope under the header sort — the export, the
  // tab badge and the pagination total speak this list
  rows: Row[]
  // the current page of rows; paging clamps, so an empty slice means an
  // empty scope
  paged: Row[]
  paging: PaginationState
  ctx: Ctx
}

export function usePaneTable<Row, Ctx>({
  area,
  catalog,
  rows,
  ctx,
  defaultSort,
}: {
  // useColumnPrefs storage area (visibility + widths persist per area)
  area: string
  // a module-level catalog: a stable identity keeps the label memo warm
  catalog: PaneColumn<Row, Ctx>[]
  // the unsorted rows of the current scope
  rows: readonly Row[]
  ctx: Ctx
  defaultSort: ColumnSort
}): PaneTable<Row, Ctx> {
  const t = useT()
  // Resolve localized labels through t — identity is stable per locale (t is
  // memoized on intl), so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => catalog.map((column) => ({ ...column, label: t(column.labelId) })),
    [catalog, t],
  )
  const prefs = useColumnPrefs(area, columns)
  const sort = useColumnSort(defaultSort)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  // Header-sorted once per (rows, sort, columns, ctx) change so the paging
  // below slices a stable order and poll ticks with unchanged payloads skip
  // the re-sort entirely (the VM scope memoizes its rows and ctx for exactly
  // this; the cheaper grids re-sort per render as they always did).
  const sorted = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]))
    return sortRows(rows, sort.sort, (row, key) => byKey.get(key)?.sortValue?.(row, ctx))
  }, [rows, sort.sort, columns, ctx])

  // clamp rather than effect-reset — polls can shrink the scope underneath;
  // a sort change re-orders the whole scope, so it starts back at page 1
  const paging = usePagination({ total: sorted.length, resetKeys: [sort.sort] })

  return {
    columns,
    visibleColumns,
    prefs,
    sort,
    rows: sorted,
    paged: paging.pageSlice(sorted),
    paging,
    ctx,
  }
}

// The PaneToolbar pagination block for a pane table.
export function paneTablePagination<Row, Ctx>(
  table: PaneTable<Row, Ctx>,
  ariaLabelId: MessageId,
): PaneToolbarPagination {
  return {
    itemCount: table.rows.length,
    page: table.paging.page,
    perPage: table.paging.perPage,
    onSetPage: table.paging.setPage,
    onPerPageSelect: table.paging.selectPerPage,
    ariaLabelId,
  }
}

// CSV export for a pane: every row of the current scope (not just the page) ×
// its visible machine-readable columns. sortValue doubles as the export value
// where a column has one; exportValue covers the columns that render a badge
// rather than a sortable scalar (Status). Same rule as the VMs & Templates
// export, so the two views' CSVs agree — see lib/csv.ts for the quoting and
// formula-injection posture.
export function exportPaneCsv<Row, Ctx>(filename: string, table: PaneTable<Row, Ctx>): void {
  const exportColumns = table.visibleColumns.filter(
    (column) => column.sortValue !== undefined || column.exportValue !== undefined,
  )
  downloadCsv(
    `${filename}-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(
      exportColumns.map((column) => column.label),
      table.rows.map((row) =>
        exportColumns.map((column) => (column.exportValue ?? column.sortValue)?.(row, table.ctx)),
      ),
    ),
  )
}
