import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { FlexItem } from '@patternfly/react-core'
import { useT } from '../i18n/useT'

// The drag-resizable tree sidebar shared by the two inventory split views
// (VMs & Templates, Hosts & Clusters). Same interaction grammar as
// ResizableTh's column handle: a slim separator rides the sidebar's trailing
// edge — pointer-capture drag with live preview, ArrowLeft/ArrowRight
// keyboard steps, double-click to reset — and the committed pixel width
// persists under ONE localStorage key for BOTH views, so the sidebar keeps
// its size when switching surfaces (they already share the 20rem default).
//
// Layout model: with no stored width the CSS class's flex-basis: 20rem rules;
// a stored width overrides it with an inline flex-basis (flex-shrink stays 0
// via the class). The FlexItem itself remains the sticky positioning box
// while the inner .inventory-tree-scroll wrapper owns the tree's
// max-height + overflow-y — an absolute handle inside the scrollbox would
// ride away with the content (see brand-tokens.css).

export const MIN_SIDEBAR_PX = 220
export const MAX_SIDEBAR_PX = 600
// what flex-basis: 20rem resolves to at the stock 16px root font — the
// pre-measurement aria-valuenow, so the separator never announces without one
const DEFAULT_SIDEBAR_PX = 320
const KEYBOARD_STEP_PX = 8
const STORAGE_KEY = 'console-sidebar-width'

export const clampSidebarWidth = (px: number): number =>
  Math.round(Math.min(MAX_SIDEBAR_PX, Math.max(MIN_SIDEBAR_PX, px)))

// Defensive parse, same posture as lib/columnPrefs: junk (non-numeric,
// non-positive, empty) reads as undefined = "no preference" and the CSS
// default rules; a stored value re-clamps on load so a hand-edited entry
// can't escape the bounds.
export function parseSidebarWidth(raw: string | null): number | undefined {
  if (raw === null) return undefined
  const px = Number(raw)
  if (!Number.isFinite(px) || px <= 0) return undefined
  return clampSidebarWidth(px)
}

function loadStoredWidth(): number | undefined {
  try {
    return parseSidebarWidth(localStorage.getItem(STORAGE_KEY))
  } catch {
    return undefined
  }
}

function storeWidth(px: number | undefined): void {
  try {
    if (px === undefined) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(px))
  } catch {
    // localStorage unavailable (private mode) — the width stays session-local
  }
}

export function InventoryTreeSidebar({ children }: { children: ReactNode }) {
  const t = useT()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState<number | undefined>(loadStoredWidth)

  // A focusable separator must always announce aria-valuenow (axe critical:
  // aria-required-attr). With no stored width the CSS default rules, so
  // measure the rendered width after mount — same as ResizableTh's measuredPx;
  // a stored width takes over as soon as it exists.
  const [measuredPx, setMeasuredPx] = useState(DEFAULT_SIDEBAR_PX)
  useEffect(() => {
    if (px === undefined) {
      const width = sidebarRef.current?.getBoundingClientRect().width
      if (width !== undefined && width > 0) setMeasuredPx(Math.round(width))
    }
  }, [px])

  const commit = (nextPx: number) => {
    const width = clampSidebarWidth(nextPx)
    storeWidth(width)
    setPx(width)
  }

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    const sidebar = sidebarRef.current
    if (!sidebar) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = sidebar.getBoundingClientRect().width

    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)

    // live preview mutates the flex-basis imperatively; the commit re-renders
    // the same clamped value through the style prop, so React and the DOM
    // agree once the drag settles (same shape as ResizableTh's drag)
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      sidebar.style.flexBasis = `${clampSidebarWidth(startWidth + (moveEvent.clientX - startX))}px`
    }
    const finish = (upEvent: globalThis.PointerEvent, apply: boolean) => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onCancel)
      if (apply) {
        commit(startWidth + (upEvent.clientX - startX))
      } else {
        // pointercancel: put back whatever ruled before the drag — the stored
        // width, or nothing so the CSS 20rem default takes over again
        sidebar.style.flexBasis = px === undefined ? '' : `${px}px`
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
    const current = px ?? sidebarRef.current?.getBoundingClientRect().width
    if (current !== undefined) commit(current + delta)
  }

  // double-click: reset to the stock 20rem — clear the stored width and drop
  // the inline flex-basis so the CSS class rules again
  const onDoubleClick = () => {
    storeWidth(undefined)
    setPx(undefined)
  }

  return (
    <FlexItem
      ref={sidebarRef}
      className="inventory-tree-sidebar"
      style={px === undefined ? undefined : { flexBasis: `${px}px` }}
    >
      <div className="inventory-tree-scroll">{children}</div>
      <span
        className="app-sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('inventory.sidebar.resize')}
        aria-valuenow={px ?? measuredPx}
        aria-valuemin={MIN_SIDEBAR_PX}
        aria-valuemax={MAX_SIDEBAR_PX}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
      />
    </FlexItem>
  )
}
