import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'

// The vitest env is 'node' (no jsdom) and the repo has no testing-library, so
// — like MoreTabsMenu.test.tsx — we render to a static HTML string. PF's Title
// is stubbed to emit its real heading element so the "exactly one <h1>" a11y
// contract is assertable; the rest of the markup is ListPageHeader's own.
vi.mock('@patternfly/react-core', () => ({
  Title: ({ headingLevel, children }: { headingLevel: string; children?: ReactNode }) =>
    createElement(headingLevel, undefined, children),
}))

const { ListPageHeader } = await import('./ListPageHeader')

const countMatches = (html: string, needle: string) => html.split(needle).length - 1

describe('ListPageHeader', () => {
  it('renders exactly one h1 carrying the title on the page-header row', () => {
    const html = renderToStaticMarkup(<ListPageHeader title="Virtual machines" />)

    expect(countMatches(html, '<h1')).toBe(1)
    expect(html).toContain('Virtual machines')
    expect(html).toContain('class="app-page-header"')
  })

  it('omits the optional slots when their props are absent', () => {
    const html = renderToStaticMarkup(<ListPageHeader title="Hosts" />)

    expect(html).not.toContain('app-page-header__meta')
    expect(html).not.toContain('app-page-header__crumb')
    expect(html).not.toContain('app-page-header__actions')
  })

  it('renders the meta, breadcrumb and actions slots when provided', () => {
    const html = renderToStaticMarkup(
      <ListPageHeader
        title="my-vm"
        meta={<span>meta-content</span>}
        breadcrumb={<span>crumb-content</span>}
        actions={<button type="button">action-content</button>}
      />,
    )

    expect(html).toContain('class="app-page-header__meta"')
    expect(html).toContain('meta-content')
    expect(html).toContain('class="app-page-header__crumb"')
    expect(html).toContain('crumb-content')
    expect(html).toContain('class="app-page-header__actions"')
    expect(html).toContain('action-content')
    // the header still owns exactly one h1 once every slot is populated.
    expect(countMatches(html, '<h1')).toBe(1)
  })

  it('renders the breadcrumb line ABOVE the title row', () => {
    const html = renderToStaticMarkup(
      <ListPageHeader title="my-vm" breadcrumb={<span>crumb-content</span>} />,
    )

    // locate first, then identify: the crumb div precedes the header row (and
    // therefore the h1) in DOM order
    expect(html.indexOf('app-page-header__crumb')).toBeLessThan(html.indexOf('<h1'))
    expect(html.indexOf('app-page-header__crumb')).toBeLessThan(
      html.indexOf('class="app-page-header"'),
    )
  })

  it('renders the entity-kind glyph inside the h1, before the title text', () => {
    const html = renderToStaticMarkup(
      <ListPageHeader title="my-vm" icon={<svg data-testid="kind-glyph" />} />,
    )

    const h1Start = html.indexOf('<h1')
    const iconAt = html.indexOf('app-page-header__icon')
    expect(iconAt).toBeGreaterThan(h1Start)
    expect(iconAt).toBeLessThan(html.indexOf('my-vm'))
    // absent icon prop renders no wrapper at all
    expect(renderToStaticMarkup(<ListPageHeader title="bare" />)).not.toContain(
      'app-page-header__icon',
    )
  })
})
