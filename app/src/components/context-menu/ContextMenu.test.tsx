import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode, RefObject } from 'react'

// The vitest env is 'node' (no jsdom) and PF react-core's node entry requires
// raw .css files node can't parse, so — like MoreTabsMenu.test.tsx — PF is
// stubbed with a passthrough that echoes the wiring under test (className,
// isOpen, the toggle render prop and children). Interactive behavior
// (dismissal listeners, focus, popper placement) belongs to the context-menu
// e2e spec, not here.
vi.mock('@patternfly/react-core', () => ({
  Dropdown: ({
    className,
    isOpen,
    toggle,
    children,
  }: {
    className?: string
    isOpen?: boolean
    toggle: (toggleRef: RefObject<HTMLSpanElement | null>) => ReactNode
    children?: ReactNode
  }) => (
    <div className={className} data-open={String(Boolean(isOpen))}>
      {toggle({ current: null })}
      {children}
    </div>
  ),
}))

const { ContextMenu, positionFromContextMenuEvent, treeRowContextValue, useContextMenu } =
  await import('./ContextMenu')

describe('positionFromContextMenuEvent', () => {
  it('passes mouse coordinates through', () => {
    expect(positionFromContextMenuEvent({ clientX: 240, clientY: 96, target: null })).toEqual({
      x: 240,
      y: 96,
    })
  })

  it('falls back to the target rect (left, bottom) for keyboard events at (0,0)', () => {
    const target = {
      getBoundingClientRect: () => ({ left: 33, bottom: 77 }),
    } as unknown as EventTarget
    expect(positionFromContextMenuEvent({ clientX: 0, clientY: 0, target })).toEqual({
      x: 33,
      y: 77,
    })
  })

  it('falls back to the target rect when coords are missing entirely', () => {
    // Playwright's dispatchEvent('contextmenu') builds an event without
    // coords — clientX/clientY come through undefined at runtime.
    const target = {
      getBoundingClientRect: () => ({ left: 12, bottom: 40 }),
    } as unknown as EventTarget
    const event = { target } as unknown as {
      clientX: number
      clientY: number
      target: EventTarget | null
    }
    expect(positionFromContextMenuEvent(event)).toEqual({ x: 12, y: 40 })
  })

  it('degrades to (0,0) when a keyboard event has no usable target', () => {
    expect(positionFromContextMenuEvent({ clientX: 0, clientY: 0, target: null })).toEqual({
      x: 0,
      y: 0,
    })
  })
})

describe('useContextMenu', () => {
  it('starts with no target and renders SSR-safe', () => {
    function Probe() {
      const menu = useContextMenu<{ id: string }>()
      return <span>{String(menu.target === null)}</span>
    }
    expect(renderToStaticMarkup(<Probe />)).toBe('<span>true</span>')
  })
})

describe('ContextMenu', () => {
  const render = () =>
    renderToStaticMarkup(
      <ContextMenu
        position={{ x: 120, y: 80 }}
        isOpen
        onOpenChange={() => {}}
        ariaLabel="Actions for vm-1"
      >
        <ul>
          <li>Start</li>
        </ul>
      </ContextMenu>,
    )

  it('server-renders without throwing and carries the stable class hook', () => {
    const html = render()

    expect(html).toContain('app-context-menu')
    // The first frame renders CLOSED even with isOpen: PF's Popper only wires
    // its floating element on a false→true open transition, so the component
    // mount-gates the Dropdown and flips it open one effect-tick later —
    // otherwise the menu portals unpositioned at the viewport origin.
    expect(html).toContain('data-open="false"')
    expect(html).toContain('<li>Start</li>')
  })

  it('renders the virtual toggle anchored at the requested position', () => {
    const html = render()

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('position:fixed')
    expect(html).toContain('left:120px')
    expect(html).toContain('top:80px')
    expect(html).toContain('pointer-events:none')
  })

  it('names the menu by injecting the aria-label into the host-provided list', () => {
    const html = render()

    expect(html).toContain('<ul aria-label="Actions for vm-1">')
  })
})

describe('treeRowContextValue', () => {
  // Stub DOM: a click target inside a PF tree-node row whose name span
  // carries the marker — mirrors what FolderTreePanel / HostsClustersPage
  // render. Duck-typed like the position tests (node env, no jsdom).
  const marker = {
    getAttribute: (name: string) => (name === 'data-folder-ctx' ? 'tag-7' : null),
  }
  const row = {
    querySelector: (selector: string) => (selector === '[data-folder-ctx]' ? marker : null),
  }

  it('resolves the marker value from anywhere inside the node row', () => {
    // e.g. the count badge: not the marked span itself, but inside the row
    const target = {
      closest: (selector: string) => (selector === '.pf-v6-c-tree-view__content' ? row : null),
    } as unknown as EventTarget
    expect(treeRowContextValue({ target }, 'data-folder-ctx')).toBe('tag-7')
  })

  it('returns null outside any node row and for non-element targets', () => {
    expect(treeRowContextValue({ target: null }, 'data-folder-ctx')).toBeNull()
    const outside = { closest: () => null } as unknown as EventTarget
    expect(treeRowContextValue({ target: outside }, 'data-folder-ctx')).toBeNull()
  })

  it('returns null for a row without the marker (the synthetic root)', () => {
    const bareRow = { querySelector: () => null }
    const target = { closest: () => bareRow } as unknown as EventTarget
    expect(treeRowContextValue({ target }, 'data-infra-ctx')).toBeNull()
  })
})
