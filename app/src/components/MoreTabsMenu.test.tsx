import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode, RefObject } from 'react'

// The vitest env is 'node' (no jsdom), and PF react-core's node (CJS) entry
// requires raw .css files node can't parse, so — like GeneralTab.test.tsx —
// the PF pieces are stubbed with semantic passthroughs. The assertions target
// MoreTabsMenu's own markup and wiring (the tab-strip <li>/<button> shape,
// aria attributes, active-tab title and isSelected routing), not PF internals.
vi.mock('@patternfly/react-core', () => ({
  Dropdown: ({
    toggle,
    children,
  }: {
    toggle: (ref: RefObject<HTMLButtonElement | null>) => ReactNode
    children?: ReactNode
  }) => (
    <>
      {toggle({ current: null })}
      {children}
    </>
  ),
  DropdownList: ({ children }: { children?: ReactNode }) => <ul>{children}</ul>,
  DropdownItem: ({ children, isSelected }: { children?: ReactNode; isSelected?: boolean }) => (
    <li data-selected={isSelected ? 'true' : 'false'}>{children}</li>
  ),
  TabTitleText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}))

vi.mock('@patternfly/react-icons', () => ({
  CaretDownIcon: () => null,
}))

const { MoreTabsMenu } = await import('./MoreTabsMenu')

const TABS = [
  { eventKey: 'applications', title: 'Applications' },
  { eventKey: 'errata', title: 'Errata' },
] as const

describe('MoreTabsMenu', () => {
  it('renders a More toggle without current styling when a primary tab is active', () => {
    const html = renderToStaticMarkup(
      <MoreTabsMenu tabs={TABS} activeKey="general" onSelect={() => {}} />,
    )

    expect(html).toMatch(/<button[^>]*aria-label="More tabs"[^>]*>[^]*?More[^]*?<\/button>/)
    expect(html).not.toContain('pf-m-current')
    expect(html).toContain('aria-selected="false"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('role="tab"')
  })

  it('shows the active tab name and current styling when one of its tabs is active', () => {
    const html = renderToStaticMarkup(
      <MoreTabsMenu tabs={TABS} activeKey="errata" onSelect={() => {}} />,
    )

    expect(html).toMatch(/<button[^>]*aria-label="More tabs"[^>]*>[^]*?Errata[^]*?<\/button>/)
    expect(html).not.toContain('More<')
    expect(html).toContain('class="pf-v6-c-tabs__item pf-m-current"')
    expect(html).toContain('aria-selected="true"')
  })

  it('marks only the active entry as selected in the menu', () => {
    const html = renderToStaticMarkup(
      <MoreTabsMenu tabs={TABS} activeKey="errata" onSelect={() => {}} />,
    )

    expect(html).toContain('<li data-selected="false">Applications</li>')
    expect(html).toContain('<li data-selected="true">Errata</li>')
  })

  it('keeps the strip markup shape PF tabs expect (li > button.pf-v6-c-tabs__link)', () => {
    const html = renderToStaticMarkup(
      <MoreTabsMenu tabs={TABS} activeKey="general" onSelect={() => {}} />,
    )

    expect(html).toMatch(/<li[^>]*class="pf-v6-c-tabs__item"[^>]*role="presentation"/)
    expect(html).toMatch(/<button[^>]*class="pf-v6-c-tabs__link"/)
  })
})
