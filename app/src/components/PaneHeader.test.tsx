import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'

// Same harness as ListPageHeader.test.tsx: the vitest env is 'node' (no jsdom)
// and the repo has no testing-library, so we render to a static HTML string.
// PF's Title is stubbed to emit its real heading element so the heading-level
// contract is assertable; useT is stubbed to echo ids, which keeps the meta
// line's assembly (kind, separators, facts) visible in the output.
vi.mock('@patternfly/react-core', () => ({
  Title: ({ headingLevel, children }: { headingLevel: string; children?: ReactNode }) =>
    createElement(headingLevel, undefined, children),
}))
vi.mock('../i18n/useT', () => ({
  useT: () => (id: string) => (id === 'infra.host.metaSeparator' ? '·' : `[${id}]`),
}))

const { PaneHeader } = await import('./PaneHeader')

const countMatches = (html: string, needle: string) => html.split(needle).length - 1
// The meta line is assembled from several elements (the kind rides its own
// bold span), so assert on the TEXT a reader sees rather than the raw markup.
const text = (html: string) => html.replace(/<[^>]*>/g, '')

describe('PaneHeader', () => {
  it('renders the name in a single h2 on the banner', () => {
    const html = renderToStaticMarkup(
      <PaneHeader icon={<svg />} name="node-01" kindId={'inventory.folder.kind'} />,
    )

    expect(countMatches(html, '<h2')).toBe(1)
    expect(html).toContain('node-01')
    expect(html).toContain('class="app-pane-header"')
  })

  it('builds the meta line as kind then each fact, separator-joined', () => {
    const html = renderToStaticMarkup(
      <PaneHeader
        icon={<svg />}
        name="node-01"
        kindId={'inventory.folder.kind'}
        facts={['Default', 'node-01.lab.local']}
      />,
    )

    expect(text(html)).toContain('[inventory.folder.kind] · Default · node-01.lab.local')
    // the kind is the one bolded word on the line
    expect(html).toContain('<span class="app-pane-header__kind">[inventory.folder.kind]</span>')
  })

  it('drops facts the caller could not resolve, keeping the separators right', () => {
    const html = renderToStaticMarkup(
      <PaneHeader
        icon={<svg />}
        name="node-01"
        kindId={'inventory.folder.kind'}
        // a cluster name that has not joined yet, between two present facts
        facts={['Default', undefined, '10.0.0.4']}
      />,
    )

    expect(text(html)).toContain('[inventory.folder.kind] · Default · 10.0.0.4')
    // no dangling separator pair where the undefined fact was
    expect(text(html)).not.toContain('· ·')
  })

  it('renders the kind alone when there are no facts at all', () => {
    const html = renderToStaticMarkup(
      <PaneHeader icon={<svg />} name="dc-1" kindId={'infra.kind.datacenter'} />,
    )

    expect(html).toContain('[infra.kind.datacenter]')
    expect(text(html)).not.toContain('·')
  })

  // the tree roots ("All infrastructure") are aggregates with no entity kind —
  // their counts are the whole meta line
  it('opens the meta line on the first fact when there is no kind', () => {
    const html = renderToStaticMarkup(
      <PaneHeader icon={<svg />} name="All infrastructure" facts={['1 data center', '6 hosts']} />,
    )

    expect(text(html)).toContain('1 data center · 6 hosts')
    // no dangling leading separator where the kind would have been
    expect(text(html)).not.toContain('· 1 data center')
    expect(html).not.toContain('app-pane-header__kind')
  })

  it('renders badges and details inline with the name, actions in their own slot', () => {
    const html = renderToStaticMarkup(
      <PaneHeader
        icon={<svg />}
        name="node-01"
        kindId={'inventory.folder.kind'}
        badges={<span>badge-content</span>}
        details={<a href="/x">details-content</a>}
        actions={<button type="button">action-content</button>}
      />,
    )

    // badges + details ride the identity row; actions get the right-aligned slot
    expect(html.indexOf('badge-content')).toBeGreaterThan(html.indexOf('app-pane-header__identity'))
    expect(html.indexOf('details-content')).toBeGreaterThan(html.indexOf('badge-content'))
    expect(html).toContain('class="app-pane-header__actions"')
    expect(html).toContain('action-content')
  })

  it('omits the actions slot entirely when no actions are passed', () => {
    const html = renderToStaticMarkup(
      <PaneHeader icon={<svg />} name="dc-1" kindId={'infra.kind.datacenter'} />,
    )

    expect(html).not.toContain('app-pane-header__actions')
  })

  it('hides the kind glyph from the accessible name', () => {
    const html = renderToStaticMarkup(
      <PaneHeader icon={<svg />} name="node-01" kindId={'inventory.folder.kind'} />,
    )

    expect(html).toContain('class="app-pane-header__icon" aria-hidden="true"')
  })
})
