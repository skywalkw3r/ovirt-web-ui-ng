import type { RefObject } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'

// Thin wrapper around @tanstack/react-virtual for a PF composable Table
// body. The library's usual absolute-positioning layout does not compose
// with <Tbody>/<Tr>, so consumers keep the table in normal flow and pad the
// scroll range with two spacer rows instead:
//
//   <Tbody>
//     {topSpacerHeight > 0 && (
//       <Tr><Td colSpan={COLUMNS} style={{ height: topSpacerHeight, padding: 0 }} /></Tr>
//     )}
//     {items.map((item) => {
//       const row = rows[item.index]
//       return <Tr key={row.id} data-index={item.index} ref={measureRow}>…</Tr>
//     })}
//     {bottomSpacerHeight > 0 && (
//       <Tr><Td colSpan={COLUMNS} style={{ height: bottomSpacerHeight, padding: 0 }} /></Tr>
//     )}
//   </Tbody>

// Starting estimate for a PF compact-table row; measureRow refines every
// rendered row afterwards, so rows that wrap (label groups) stay accurate.
const ESTIMATED_ROW_HEIGHT = 41
// Rows rendered beyond the viewport on each side — keyboard scrolling and
// flick-scrolls hit painted rows instead of blank spacer.
const OVERSCAN = 10

export interface VirtualRows {
  // the visible window (plus overscan); item.index addresses the source rows
  items: VirtualItem[]
  // combined height of every row — the full scroll range
  totalHeight: number
  // spacer-row heights above/below the window keeping that range in place
  topSpacerHeight: number
  bottomSpacerHeight: number
  // ref callback for each rendered <Tr>; requires data-index={item.index}
  measureRow: (el: Element | null) => void
}

// scrollParentRef points at the scrollable ancestor (the container wrapping
// the <Table>), count is the total number of data rows.
export function useVirtualRows(
  scrollParentRef: RefObject<HTMLElement | null>,
  count: number,
): VirtualRows {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  const items = virtualizer.getVirtualItems()
  const totalHeight = virtualizer.getTotalSize()
  const last = items.at(-1)
  return {
    items,
    totalHeight,
    topSpacerHeight: items[0]?.start ?? 0,
    bottomSpacerHeight: last ? totalHeight - last.end : 0,
    measureRow: virtualizer.measureElement,
  }
}
