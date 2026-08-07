import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import type { Host } from '../api/schemas/host'

// Same harness as PaneHeader.test.tsx: the vitest env is 'node' (no jsdom) and
// the repo has no testing-library, so we render to a static HTML string. PF's
// Tooltip is stubbed to emit its content inline (there is no hover to drive
// here) and the two icons to marker elements, so which severity glyph was
// chosen is assertable. useT echoes ids with the plural count.
vi.mock('@patternfly/react-core', () => ({
  Tooltip: ({ content, children }: { content: ReactNode; children?: ReactNode }) =>
    createElement('div', undefined, createElement('div', { 'data-tip': '' }, content), children),
}))
vi.mock('@patternfly/react-icons', () => ({
  ExclamationCircleIcon: () => createElement('svg', { 'data-icon': 'circle' }),
  ExclamationTriangleIcon: () => createElement('svg', { 'data-icon': 'triangle' }),
}))
vi.mock('../i18n/useT', () => ({
  useT: () => (id: string, values?: { count?: number }) =>
    values?.count === undefined ? `[${id}]` : `[${id} ${values.count}]`,
}))

const { ClusterHealthBadge, unhealthyHosts } = await import('./ClusterHealthBadge')

const host = (name: string, status?: string): Host => ({ id: `id-${name}`, name, status }) as Host
const markup = (hosts: Host[]) => renderToStaticMarkup(<ClusterHealthBadge hosts={hosts} />)
const text = (html: string) => html.replace(/<[^>]*>/g, '')

describe('unhealthyHosts', () => {
  it('keeps only hosts the engine reports as something other than up', () => {
    // status is an open string off the engine, so casing is never assumed
    const found = unhealthyHosts([host('a', 'up'), host('b', 'maintenance'), host('c', 'UP')])
    expect(found.map((h) => h.name)).toEqual(['b'])
  })

  it('ignores hosts whose status has not arrived yet', () => {
    expect(unhealthyHosts([host('a'), host('b', 'up')])).toEqual([])
  })

  it('sorts failures ahead of maintenance, then by name', () => {
    const found = unhealthyHosts([
      host('zeta', 'maintenance'),
      host('beta', 'non_responsive'),
      host('alpha', 'maintenance'),
      host('gamma', 'down'),
    ])
    expect(found.map((h) => h.name)).toEqual(['beta', 'gamma', 'alpha', 'zeta'])
  })
})

describe('ClusterHealthBadge', () => {
  it('renders nothing when every host is up', () => {
    expect(markup([host('a', 'up'), host('b', 'up')])).toBe('')
  })

  it('names the count of hosts that are not up', () => {
    const html = markup([host('a', 'up'), host('b', 'maintenance'), host('c', 'down')])
    expect(html).toContain('aria-label="[infra.tree.cluster.hostsNotUp 2]"')
  })

  it('is keyboard reachable so the tooltip is not hover-only', () => {
    expect(markup([host('a', 'maintenance')])).toContain('tabindex="0"')
  })

  it('warns in yellow when hosts are only parked, escalates to red on a failure', () => {
    expect(markup([host('a', 'maintenance')])).toContain('data-icon="triangle"')
    expect(markup([host('a', 'maintenance'), host('b', 'non_responsive')])).toContain(
      'data-icon="circle"',
    )
  })

  it('lists each unhealthy host and its status in the tooltip', () => {
    const body = text(markup([host('a', 'maintenance'), host('b', 'non_responsive')]))
    expect(body).toContain('b — Non responsive')
    expect(body).toContain('a — Maintenance')
  })

  it('caps the tooltip list and counts the rest', () => {
    const hosts = Array.from({ length: 11 }, (_, i) => host(`h${i}`, 'maintenance'))
    const body = text(markup(hosts))
    expect(body).toContain('[infra.tree.cluster.hostsNotUp.more 3]')
    expect(body.match(/Maintenance/g)).toHaveLength(8)
  })
})
