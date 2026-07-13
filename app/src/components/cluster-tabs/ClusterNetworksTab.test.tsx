import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Network } from '../../api/schemas/network'
import { enMessages } from '../../i18n/messages/en'

// Node test env + PF CSS imports → stub PF with semantic passthroughs (the
// ClusterAffinityGroupsTab.test.tsx pattern). Assertions target the tab's
// composition: the four states and the new cluster-role column that renders the
// attachment's usages as labels — not PF markup.
vi.mock('@patternfly/react-core', () => ({
  Button: ({ children, isDisabled }: { children?: ReactNode; isDisabled?: boolean }) => (
    <button disabled={isDisabled}>{children}</button>
  ),
  EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) => (
    <div>
      <h4>{titleText}</h4>
      {children}
    </div>
  ),
  EmptyStateBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  LabelGroup: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    'aria-label'?: string
  }) => <span aria-label={ariaLabel}>{children}</span>,
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  Toolbar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@patternfly/react-table', () => ({
  Table: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    'aria-label'?: string
  }) => <table aria-label={ariaLabel}>{children}</table>,
  Thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  Tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  Tr: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
  Th: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  Td: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))

const state = vi.hoisted(() => ({
  networks: {} as UseQueryResult<Network[], Error>,
}))

vi.mock('../../hooks/useClusterDetail', () => ({
  useClusterNetworks: () => state.networks,
}))

// Keep the modal's dependency tree out of this suite — the tab only mounts it
// behind interaction state, which static render never reaches.
vi.mock('./ManageClusterNetworksModal', () => ({ ManageClusterNetworksModal: () => null }))

const { ClusterNetworksTab } = await import('./ClusterNetworksTab')

function asQuery(
  partial: Partial<UseQueryResult<Network[], Error>>,
): UseQueryResult<Network[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
    ...partial,
  } as unknown as UseQueryResult<Network[], Error>
}

const NETWORKS = [
  {
    id: 'net-01',
    name: 'ovirtmgmt',
    required: true,
    usages: { usage: ['vm', 'management', 'migration', 'default_route'] },
  },
  { id: 'net-03', name: 'storage', required: false, usages: { usage: [] } },
] as Network[]

// The tab reads every label through useT/useIntl, so the render needs an
// IntlProvider; the real en catalog keeps the English assertions meaningful.
function render() {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <ClusterNetworksTab clusterId="cluster-01" dataCenterId="dc-01" />
    </IntlProvider>,
  )
}

describe('ClusterNetworksTab', () => {
  it('renders the loading skeleton', () => {
    state.networks = asQuery({ isPending: true })
    expect(render()).toContain('Loading logical networks')
  })

  it('renders the error state with a retry', () => {
    state.networks = asQuery({ isError: true, error: new Error('boom') })
    const html = render()
    expect(html).toContain('Could not load logical networks')
    expect(html).toContain('boom')
    expect(html).toContain('Retry')
  })

  it('renders the empty state', () => {
    state.networks = asQuery({ isSuccess: true, data: [] })
    expect(render()).toContain('No logical networks')
  })

  it('renders the roles column with the attachment usages as labels', () => {
    state.networks = asQuery({ isSuccess: true, data: NETWORKS })
    const html = render()
    expect(html).toContain('Manage networks')
    expect(html).toContain('<th>Roles</th>')
    // net-01's cluster roles render as human labels
    expect(html).toContain('VM')
    expect(html).toContain('Management')
    expect(html).toContain('Migration')
    expect(html).toContain('Default route')
    expect(html).toContain('aria-label="Roles for ovirtmgmt"')
    // net-03 carries no roles → em dash
    expect(html).toContain('—')
  })
})
