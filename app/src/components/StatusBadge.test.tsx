import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

// The vitest env is 'node' (no jsdom) and the repo has no testing-library, so
// — like MoreTabsMenu.test.tsx — we render to a static HTML string and stub PF
// with a passthrough that echoes the props StatusBadge is contracted to
// forward (color, isCompact, className, icon). The assertions target that
// wiring, not PF Label's internals.
vi.mock('@patternfly/react-core', () => ({
  Label: ({
    color,
    icon,
    isCompact,
    className,
    children,
  }: {
    color?: string
    icon?: ReactNode
    isCompact?: boolean
    className?: string
    children?: ReactNode
  }) => (
    <span data-color={color} data-compact={String(Boolean(isCompact))} className={className}>
      {icon}
      {children}
    </span>
  ),
}))

const { StatusBadge } = await import('./StatusBadge')

describe('StatusBadge', () => {
  it('forwards the color prop and carries the app-status-label styling hook', () => {
    const html = renderToStaticMarkup(<StatusBadge color="green">Running</StatusBadge>)

    expect(html).toContain('data-color="green"')
    expect(html).toContain('class="app-status-label"')
    expect(html).toContain('data-compact="true"')
    expect(html).toContain('Running')
  })

  it('defaults to grey when no color is given', () => {
    const html = renderToStaticMarkup(<StatusBadge>Unknown</StatusBadge>)

    expect(html).toContain('data-color="grey"')
  })

  it('renders the supplied icon in place of the status dot', () => {
    const html = renderToStaticMarkup(
      <StatusBadge color="red" icon={<svg data-icon="bell" />}>
        Alert
      </StatusBadge>,
    )

    expect(html).toContain('data-icon="bell"')
    expect(html).toContain('Alert')
  })
})
