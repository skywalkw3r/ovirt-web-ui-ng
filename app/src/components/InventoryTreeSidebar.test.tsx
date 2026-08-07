import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

// The vitest env is 'node' (no jsdom) and the repo has no testing-library, so
// — like StatusBadge.test.tsx — the render assertions target a static HTML
// string with PF stubbed to a passthrough. The clamp/parse exports are pure
// functions and need no DOM at all. There is no localStorage in this env:
// loadStoredWidth's try/catch turns the ReferenceError into "no preference",
// which is exactly the code path the default-width render exercises.
vi.mock('@patternfly/react-core', () => ({
  FlexItem: ({
    className,
    style,
    children,
  }: {
    className?: string
    style?: Record<string, string>
    children?: ReactNode
  }) => (
    <div className={className} style={style}>
      {children}
    </div>
  ),
}))
vi.mock('../i18n/useT', () => ({
  useT: () => (id: string) => id,
}))

const {
  InventoryTreeSidebar,
  MAX_SIDEBAR_PX,
  MIN_SIDEBAR_PX,
  clampSidebarWidth,
  parseSidebarWidth,
} = await import('./InventoryTreeSidebar')

describe('clampSidebarWidth', () => {
  it('clamps into [MIN, MAX] and rounds', () => {
    expect(clampSidebarWidth(100)).toBe(MIN_SIDEBAR_PX)
    expect(clampSidebarWidth(9000)).toBe(MAX_SIDEBAR_PX)
    expect(clampSidebarWidth(300.4)).toBe(300)
    expect(clampSidebarWidth(300.6)).toBe(301)
    expect(clampSidebarWidth(MIN_SIDEBAR_PX)).toBe(MIN_SIDEBAR_PX)
    expect(clampSidebarWidth(MAX_SIDEBAR_PX)).toBe(MAX_SIDEBAR_PX)
  })
})

describe('parseSidebarWidth', () => {
  it('reads a plain integer string back as a clamped width', () => {
    expect(parseSidebarWidth('336')).toBe(336)
    // a hand-edited value re-clamps on load
    expect(parseSidebarWidth('50')).toBe(MIN_SIDEBAR_PX)
    expect(parseSidebarWidth('99999')).toBe(MAX_SIDEBAR_PX)
  })

  it('treats junk as "no preference"', () => {
    expect(parseSidebarWidth(null)).toBeUndefined()
    expect(parseSidebarWidth('')).toBeUndefined()
    expect(parseSidebarWidth('abc')).toBeUndefined()
    expect(parseSidebarWidth('NaN')).toBeUndefined()
    expect(parseSidebarWidth('-40')).toBeUndefined()
    expect(parseSidebarWidth('0')).toBeUndefined()
  })
})

describe('InventoryTreeSidebar', () => {
  it('renders the scroll wrapper and a fully-attributed separator handle', () => {
    const html = renderToStaticMarkup(
      <InventoryTreeSidebar>
        <span>tree goes here</span>
      </InventoryTreeSidebar>,
    )

    expect(html).toContain('class="inventory-tree-sidebar"')
    // children live in the inner scroll wrapper, not directly in the FlexItem
    expect(html).toContain('<div class="inventory-tree-scroll"><span>tree goes here</span></div>')
    // the separator always carries the axe-required value triplet, even
    // before any width is stored (the 20rem default announced in px)
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).toContain('aria-label="inventory.sidebar.resize"')
    expect(html).toContain('aria-valuenow="320"')
    expect(html).toContain(`aria-valuemin="${MIN_SIDEBAR_PX}"`)
    expect(html).toContain(`aria-valuemax="${MAX_SIDEBAR_PX}"`)
    expect(html).toContain('tabindex="0"')
    // no stored width: no inline flex-basis — the CSS class's 20rem rules
    expect(html).not.toContain('flex-basis')
  })
})
