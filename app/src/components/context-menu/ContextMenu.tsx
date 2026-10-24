import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { Dropdown } from '@patternfly/react-core'

/* oxlint-disable react/only-export-components -- the context-menu contract
   pins the helper + hook + component exports to this one file (same precedent
   as SettingsProvider) */

// vCenter-style right-click context menu primitive. Hosts wire it in three
// parts: positionFromContextMenuEvent (cursor/keyboard coords), useContextMenu
// (page-level open/close state, one instance per surface so only one menu is
// ever open), and <ContextMenu> (the cursor-anchored PF Dropdown shell whose
// children are a host-provided <DropdownList> — the same list a row kebab
// renders, so items, RBAC gating and toasts stay identical).

export type ContextMenuPosition = { x: number; y: number }

// Mouse-driven contextmenu events carry pointer coords; keyboard-invoked ones
// (Shift+F10 / the Menu key — or Playwright's coordless dispatchEvent) arrive
// with (0,0) or missing coords, so anchor those to the event target's rect
// (left, bottom): the menu hangs off the focused element instead of opening in
// the viewport corner. Duck-typed (no instanceof Element) so it also works in
// the node-env unit tests with stub targets.
export function positionFromContextMenuEvent(event: {
  clientX: number
  clientY: number
  target: EventTarget | null
}): ContextMenuPosition {
  const { clientX, clientY } = event
  const target = event.target as { getBoundingClientRect?: () => DOMRect } | null
  if (!clientX && !clientY && typeof target?.getBoundingClientRect === 'function') {
    const rect = target.getBoundingClientRect()
    return { x: rect.left, y: rect.bottom }
  }
  return { x: clientX || 0, y: clientY || 0 }
}

// Whole-row tree-node right-click resolution. PF TreeView renders each node's
// row (toggle, icon, name, count badge) inside its own
// .pf-v6-c-tree-view__content — child nodes nest in a SIBLING <ul> — so the
// closest content container identifies exactly one node wherever in the row
// the click landed. Tree surfaces stamp an id-bearing data attribute on the
// name span and delegate a single onContextMenu on the tree wrapper through
// this helper: right-clicking the icon, the badge, or the row's padding opens
// the same menu as the name text. Returns the marker's value, or null when
// the click wasn't on a marked node row (leaving the browser's native menu).
// Duck-typed like positionFromContextMenuEvent so node-env unit tests can
// drive it with stub targets.
export function treeRowContextValue(
  event: { target: EventTarget | null },
  attribute: string,
): string | null {
  const target = event.target as { closest?: (selector: string) => Element | null } | null
  if (typeof target?.closest !== 'function') return null
  const row = target.closest('.pf-v6-c-tree-view__content')
  return row?.querySelector(`[${attribute}]`)?.getAttribute(attribute) ?? null
}

// Page/panel-level context-menu state. open() suppresses the native menu and
// records what was right-clicked and where; a second open() (right-click on
// another row) replaces the first, keeping one menu open at a time. token
// increments on every open() so consumers key the rendered menu by it and
// re-opening on the same entity still remounts the menu fresh.
export function useContextMenu<T>(): {
  target: { position: ContextMenuPosition; ctx: T; token: number } | null
  open: (event: ReactMouseEvent, ctx: T) => void
  close: () => void
} {
  const [target, setTarget] = useState<{
    position: ContextMenuPosition
    ctx: T
    token: number
  } | null>(null)
  const tokenRef = useRef(0)

  const open = useCallback((event: ReactMouseEvent, ctx: T) => {
    // preventDefault only here, on handled right-clicks — everywhere else the
    // browser's native menu stays. stopPropagation keeps an outer surface's
    // own contextmenu handler from opening a second menu over this one.
    event.preventDefault()
    event.stopPropagation()
    tokenRef.current += 1
    setTarget({ position: positionFromContextMenuEvent(event), ctx, token: tokenRef.current })
  }, [])

  const close = useCallback(() => {
    setTarget(null)
  }, [])

  return { target, open, close }
}

// Keep the virtual anchor inside the viewport so Popper always has a sane
// reference rect to flip/shift the menu against.
const VIEWPORT_MARGIN = 16

function clampToViewport({ x, y }: ContextMenuPosition): ContextMenuPosition {
  // SSR / node-env tests have no window; Popper only positions in the
  // browser, so the raw position is fine there.
  if (typeof window === 'undefined') return { x, y }
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN)
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN)
  return {
    x: Math.min(Math.max(x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(y, VIEWPORT_MARGIN), maxY),
  }
}

// PF's first-item-focus selector, copied from Dropdown.js so the mount-open
// focus below behaves exactly like shouldFocusFirstItemOnOpen.
const FIRST_ITEM_SELECTOR =
  'li button:not(:disabled),li input:not(:disabled),li a:not([aria-disabled="true"])'

// Interactions inside the open menu or inside any open PF modal must not
// dismiss the menu — item-owned modals (Run Once, Change CD, Move to
// folder, …) open on top of it and shield their clicks; right-clicks and
// scrolls get the same shield semantics here. Non-element targets (document /
// window on a page scroll) count as outside. Duck-typed for the same reason
// as positionFromContextMenuEvent.
function isOutsideMenuAndModals(eventTarget: EventTarget | null): boolean {
  const target = eventTarget as { closest?: (selector: string) => Element | null } | null
  if (typeof target?.closest !== 'function') return true
  return !target.closest('.app-context-menu, .pf-v6-c-modal-box')
}

// Cursor-positioned menu shell. Composes PF Dropdown exactly like the row
// kebabs (toggle render prop + host-provided DropdownList children) but
// anchors the popper to an invisible fixed 1×1 span at the right-click
// position instead of a MenuToggle button. Selecting an item does NOT
// auto-close the menu at this level — items decide, matching the kebabs
// (modal items keep the menu open underneath their modal).
export function ContextMenu({
  position,
  isOpen,
  onOpenChange,
  ariaLabel,
  children,
}: {
  position: ContextMenuPosition
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  ariaLabel: string
  children: ReactNode
}): JSX.Element {
  // Dropdown forwards its ref to the popped Menu element — needed for the
  // mount-open first-item focus below.
  const menuRef = useRef<HTMLDivElement>(null)
  const focusedFirstItemRef = useRef(false)

  // PF's Popper only wires up its floating element on an isOpen false→true
  // transition (its popperRef effect keys on visibility, which never changes
  // for a menu that MOUNTS open) — without a transition the menu is portaled
  // with react-popper's seed styles and sticks at the viewport origin (0,0).
  // So mount the Dropdown closed and flip it open one effect-tick later; the
  // anchor span has committed its cursor coords by then, and PF positions,
  // flips and focuses exactly as it does for a clicked-open kebab.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Best-effort focus restore: capture whatever had focus when the menu
  // mounted and give it back on unmount (the menu steals focus to its first
  // item, and PF's own Escape handling "restores" focus to our unfocusable
  // anchor span, i.e. nowhere).
  useEffect(() => {
    const previouslyFocused = document.activeElement
    return () => {
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [])

  // PF's shouldFocusFirstItemOnOpen only fires on a false→true isOpen
  // transition (Dropdown.js seeds its prevIsOpen ref with the initial value),
  // so a menu that MOUNTS open — the context-menu case — never gets it.
  // Replicate the same deferred focus for the first open; the timeout also
  // lets Popper flip `ready` and portal the menu content into the DOM first.
  // The one-shot flag is set inside the timeout so StrictMode's simulated
  // mount/unmount (which clears the first timer) doesn't burn it, and later
  // false→true re-opens stay PF's job.
  useEffect(() => {
    if (!isOpen || focusedFirstItemRef.current) return
    const timer = window.setTimeout(() => {
      focusedFirstItemRef.current = true
      menuRef.current?.querySelector<HTMLElement>(FIRST_ITEM_SELECTOR)?.focus({
        preventScroll: true,
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  // Dismissal beyond PF's built-in click-outside/Escape/Tab handling:
  // right-click outside, scroll outside, and window resize — except while a
  // PF modal is up, when the menu must keep waiting underneath it.
  useEffect(() => {
    if (!isOpen) return
    const onContextMenu = (event: MouseEvent) => {
      if (isOutsideMenuAndModals(event.target)) onOpenChange(false)
    }
    const onScroll = (event: Event) => {
      if (isOutsideMenuAndModals(event.target)) onOpenChange(false)
    }
    const onResize = () => {
      if (!document.querySelector('.pf-v6-c-modal-box')) onOpenChange(false)
    }
    document.addEventListener('contextmenu', onContextMenu, true)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onResize)
    }
  }, [isOpen, onOpenChange])

  const anchor = clampToViewport(position)

  // The menu's accessible name belongs on the DropdownList's ul[role=menu].
  // Menu's root div — where a Dropdown-level aria-label would land — is
  // role-generic, and aria-label there is an axe serious finding
  // (aria-prohibited-attr), so inject it into the host-provided list instead.
  const menuChildren = isValidElement<{ 'aria-label'?: string }>(children)
    ? cloneElement(children, { 'aria-label': children.props['aria-label'] ?? ariaLabel })
    : children

  return (
    <Dropdown
      ref={menuRef}
      className="app-context-menu"
      isOpen={isOpen && mounted}
      onOpenChange={onOpenChange}
      shouldFocusFirstItemOnOpen
      popperProps={{ appendTo: () => document.body, enableFlip: true, preventOverflow: true }}
      toggle={(toggleRef: Ref<HTMLSpanElement>) => (
        // Virtual toggle: an invisible fixed-position anchor at the cursor
        // for Popper to position the menu against.
        <span
          ref={toggleRef}
          aria-hidden
          style={{
            position: 'fixed',
            left: anchor.x,
            top: anchor.y,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      )}
    >
      {menuChildren}
    </Dropdown>
  )
}
