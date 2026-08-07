import { useCallback, useState } from 'react'
import {
  clearColumnPrefs,
  loadColumnPrefs,
  loadColumnWidths,
  saveColumnPrefs,
  saveColumnWidths,
} from '../lib/columnPrefs'

export interface ColumnDef {
  key: string
  label: string
  // always-visible columns (identity columns like Name) can never be hidden:
  // toggles on them are ignored and they are re-added over stale saved prefs
  always?: boolean
  // starts unchecked when the user has no saved preference (and after Reset)
  // — for parity columns worth offering but not worth default real estate
  defaultHidden?: boolean
}

// A column revealed after the grid has gone fixed-layout has no measured
// width (it wasn't on screen when the first drag snapshotted the row) — seed
// it with a readable default instead of letting fixed layout collapse it.
const REVEALED_COLUMN_PX = 150

export interface ColumnPrefs {
  visible: Set<string>
  isVisible: (key: string) => boolean
  toggle: (key: string) => void
  reset: () => void
  // column-key → user-dragged pixel width; empty until a header edge has been
  // dragged in this area. Hidden columns keep their width so re-showing one
  // restores its last size.
  widths: Record<string, number>
  // true once any width is stored — ResizableTh/resizableTableProps switch
  // the table from fluid (auto) to fixed layout on this flag
  hasWidths: boolean
  // persist one column's width (px; ResizableTh clamps before calling)
  setWidth: (key: string, px: number) => void
  // merge a batch at once — the first drag snapshots every visible column so
  // fixed layout freezes the grid as rendered instead of reshuffling it
  setWidths: (batch: Record<string, number>) => void
}

// Per-page column visibility + drag widths, webadmin's column menu and
// resizable grid: seeded from the saved preference (or all columns/fluid
// layout when none is saved), persisted through lib/columnPrefs on every
// change. The store is pure localStorage — this hook owns the live values the
// table, ResizableTh, and ColumnPicker render from.
export function useColumnPrefs(area: string, columns: ColumnDef[]): ColumnPrefs {
  const [visible, setVisible] = useState<Set<string>>(() => {
    const saved = loadColumnPrefs(area)
    if (saved === null) {
      return new Set(
        columns.filter((column) => column.defaultHidden !== true).map((column) => column.key),
      )
    }
    // union the always-columns back in so a stale pref can't hide them
    return new Set([
      ...saved,
      ...columns.filter((column) => column.always === true).map((column) => column.key),
    ])
  })
  const [widths, setWidthsState] = useState<Record<string, number>>(() => loadColumnWidths(area))

  const isVisible = useCallback((key: string) => visible.has(key), [visible])

  const persistWidths = useCallback(
    (next: Record<string, number>) => {
      saveColumnWidths(area, next)
      setWidthsState(next)
    },
    [area],
  )

  const setWidth = useCallback(
    (key: string, px: number) => {
      persistWidths({ ...widths, [key]: px })
    },
    [persistWidths, widths],
  )

  const setWidths = useCallback(
    (batch: Record<string, number>) => {
      persistWidths({ ...widths, ...batch })
    },
    [persistWidths, widths],
  )

  const toggle = useCallback(
    (key: string) => {
      const column = columns.find((entry) => entry.key === key)
      if (column === undefined || column.always === true) return
      const next = new Set(visible)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        // fixed-layout grid: a newly revealed column needs a width of its own
        // or the layout algorithm gives it only the leftover slack
        if (Object.keys(widths).length > 0 && widths[key] === undefined) {
          persistWidths({ ...widths, [key]: REVEALED_COLUMN_PX })
        }
      }
      // persist in declared column order so the saved list stays stable
      saveColumnPrefs(
        area,
        columns.filter((entry) => next.has(entry.key)).map((entry) => entry.key),
      )
      setVisible(next)
    },
    [area, columns, persistWidths, visible, widths],
  )

  const reset = useCallback(() => {
    // clears visibility AND widths — one action restores the stock grid
    clearColumnPrefs(area)
    setVisible(
      new Set(
        columns.filter((column) => column.defaultHidden !== true).map((column) => column.key),
      ),
    )
    setWidthsState({})
  }, [area, columns])

  return {
    visible,
    isVisible,
    toggle,
    reset,
    widths,
    hasWidths: Object.keys(widths).length > 0,
    setWidth,
    setWidths,
  }
}
