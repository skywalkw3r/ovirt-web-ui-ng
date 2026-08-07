import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { Th, type ThProps } from '@patternfly/react-table'
import type { ColumnPrefs } from '../../hooks/useColumnPrefs'
import { useT } from '../../i18n/useT'

// Webadmin's drag-resizable grid columns for PF6, which has no built-in
// column resizing. A slim handle rides the trailing edge of each header cell
// (Th's additionalContent slot, so it stays OUTSIDE any future sort-button
// wrapper); dragging it persists a pixel width through useColumnPrefs and the
// table flips from fluid (auto) to fixed layout — see resizableTableProps.
//
// Layout model: a fluid table has no stored widths and behaves exactly as
// before (PF preset percent widths, content-driven). The FIRST drag snapshots
// every resizable column at its rendered width before adjusting the dragged
// one — with table-layout:fixed, width-less columns share leftover space
// equally regardless of content, so without the snapshot the first drag would
// visibly reshuffle its neighbors. From then on drags are local: one column
// changes, the rest hold, and the table grows into its scroll viewport when
// the sum outgrows the container (fixed layout sizes the table to
// max(100%, Σ columns)). ColumnPicker's Reset clears the widths and restores
// the fluid grid.

export const MIN_COLUMN_PX = 60
export const MAX_COLUMN_PX = 1200
const KEYBOARD_STEP_PX = 8

const clamp = (px: number): number =>
  Math.round(Math.min(MAX_COLUMN_PX, Math.max(MIN_COLUMN_PX, px)))

// Room for the width-less control columns (row-actions kebab / bulk-select
// checkbox) that ride along in the min-width sum below.
const CONTROL_COLUMNS_SLACK_PX = 96

// Spread onto the <Table> of a resizable grid. Fixed layout makes the stored
// pixel widths authoritative (auto layout treats them as suggestions), and
// min-width keeps them honored when their sum outgrows the container — a
// 100%-width fixed table would otherwise compress every column
// proportionally; with the floor it grows into the .app-table-viewport
// scroll box instead, webadmin-style. The class lets brand-tokens.css pin
// control columns (checkbox/toggle) that carry no data-column width so they
// can't absorb the leftover space.
export function resizableTableProps(prefs: ColumnPrefs): {
  className?: string
  style?: CSSProperties
} {
  if (!prefs.hasWidths) return {}
  const visibleTotal = Object.entries(prefs.widths)
    .filter(([key]) => prefs.visible.has(key))
    .reduce((sum, [, px]) => sum + px, 0)
  return {
    className: 'app-table-fixed',
    style: { tableLayout: 'fixed', minWidth: visibleTotal + CONTROL_COLUMNS_SLACK_PX },
  }
}

interface ResizableThProps extends Omit<ThProps, 'width' | 'ref'> {
  columnKey: string
  // plain-text column label for the handle's aria-label (children may be a node)
  label: string
  prefs: ColumnPrefs
  // PF preset percent width, honored only while the grid is still fluid
  presetWidth?: ThProps['width']
}

export function ResizableTh({
  columnKey,
  label,
  prefs,
  presetWidth,
  children,
  style,
  ...rest
}: ResizableThProps) {
  const t = useT()
  const thRef = useRef<HTMLTableCellElement>(null)
  const px = prefs.widths[columnKey]

  // A focusable separator must always announce aria-valuenow (axe critical:
  // aria-required-attr). Fluid columns have no stored width, so measure the
  // rendered one after mount; a stored width takes over as soon as it exists.
  const [measuredPx, setMeasuredPx] = useState(MIN_COLUMN_PX)
  useEffect(() => {
    if (px === undefined) {
      const width = thRef.current?.getBoundingClientRect().width
      if (width !== undefined && width > 0) setMeasuredPx(Math.round(width))
    }
  }, [px])

  // measure every resizable header in this row (the first-drag snapshot)
  const measureRow = (): Record<string, number> => {
    const batch: Record<string, number> = {}
    const row = thRef.current?.parentElement
    if (!row) return batch
    for (const cell of row.querySelectorAll<HTMLTableCellElement>('th[data-app-column]')) {
      const key = cell.dataset.appColumn
      if (key !== undefined && key !== '') {
        batch[key] = Math.round(cell.getBoundingClientRect().width)
      }
    }
    return batch
  }

  const commit = (nextPx: number) => {
    const width = clamp(nextPx)
    if (prefs.hasWidths) {
      prefs.setWidth(columnKey, width)
    } else {
      prefs.setWidths({ ...measureRow(), [columnKey]: width })
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    const th = thRef.current
    const table = th?.closest('table')
    if (!th || !table) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = th.getBoundingClientRect().width

    // still fluid: freeze the grid imperatively so the drag previews exactly
    // what the commit will render (React re-applies the same values after)
    if (!prefs.hasWidths) {
      const frozen = measureRow()
      const row = th.parentElement
      if (row) {
        for (const cell of row.querySelectorAll<HTMLTableCellElement>('th[data-app-column]')) {
          const key = cell.dataset.appColumn
          if (key !== undefined && frozen[key] !== undefined) {
            cell.style.width = `${frozen[key]}px`
          }
        }
      }
      table.style.tableLayout = 'fixed'
      // the class lifts the 48ch cell cap and pins control columns — without
      // it the live preview clamps where the committed layout won't
      table.classList.add('app-table-fixed')
    }

    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      th.style.width = `${clamp(startWidth + (moveEvent.clientX - startX))}px`
    }
    const finish = (upEvent: globalThis.PointerEvent, apply: boolean) => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onCancel)
      if (apply) {
        commit(startWidth + (upEvent.clientX - startX))
      } else {
        th.style.width = `${startWidth}px`
      }
    }
    const onUp = (upEvent: globalThis.PointerEvent) => finish(upEvent, true)
    const onCancel = (cancelEvent: globalThis.PointerEvent) => finish(cancelEvent, false)
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onCancel)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    let delta = 0
    if (event.key === 'ArrowLeft') delta = -KEYBOARD_STEP_PX
    else if (event.key === 'ArrowRight') delta = KEYBOARD_STEP_PX
    else return
    event.preventDefault()
    event.stopPropagation()
    const current = px ?? thRef.current?.getBoundingClientRect().width
    if (current !== undefined) commit(current + delta)
  }

  // double-click: auto-fit to the widest cell in the column, webadmin-style
  const onDoubleClick = () => {
    const th = thRef.current
    const row = th?.parentElement
    const body = th?.closest('table')?.querySelector('tbody')
    if (!th || !row || !body) return
    const index = Array.prototype.indexOf.call(row.children, th)
    if (index < 0) return
    let widest = th.scrollWidth
    for (const tr of body.querySelectorAll(':scope > tr')) {
      const cell = tr.children[index]
      if (cell instanceof HTMLElement) widest = Math.max(widest, cell.scrollWidth)
    }
    commit(widest + 2)
  }

  return (
    <Th
      ref={thRef}
      data-app-column={columnKey}
      // the preset percent only steers the fluid layout; once a pixel width
      // exists it IS the column width under table-layout:fixed
      width={px === undefined ? presetWidth : undefined}
      style={px === undefined ? style : { ...style, width: `${px}px` }}
      {...rest}
      additionalContent={
        <span
          className="app-col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('common.columns.resize', { name: label })}
          aria-valuenow={px === undefined ? measuredPx : Math.round(px)}
          aria-valuemin={MIN_COLUMN_PX}
          aria-valuemax={MAX_COLUMN_PX}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onDoubleClick={onDoubleClick}
          onClick={(event) => event.stopPropagation()}
        />
      }
    >
      {children}
    </Th>
  )
}
