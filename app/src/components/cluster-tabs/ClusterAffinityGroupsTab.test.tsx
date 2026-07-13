import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ClusterAffinityGroup } from '../../api/resources/clusters'

// Node test env + PF CSS imports → stub PF with semantic passthroughs (the
// PermissionsPanel.test.tsx pattern). Assertions target the tab's composition:
// the four states, the New affordance (toolbar + empty-state CTA), and the
// per-row Edit/Remove kebab — not PF markup.
vi.mock('@patternfly/react-core', () => ({
  Button: ({
    children,
    isDisabled,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    isDisabled?: boolean
    'aria-label'?: string
  }) => (
    <button disabled={isDisabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) => (
    <div>
      <h4>{titleText}</h4>
      {children}
    </div>
  ),
  EmptyStateActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  EmptyStateBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  EmptyStateFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  Toolbar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
  Th: ({ children, screenReaderText }: { children?: ReactNode; screenReaderText?: string }) => (
    <th>{children ?? screenReaderText}</th>
  ),
  Td: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
  ActionsColumn: ({ items }: { items: { title?: string; isDanger?: boolean }[] }) => (
    <button aria-label={`Row actions: ${items.map((item) => item.title).join(',')}`}>⋮</button>
  ),
}))

const state = vi.hoisted(() => ({
  groups: {} as UseQueryResult<ClusterAffinityGroup[], Error>,
}))

vi.mock('../../hooks/useClusterDetail', () => ({
  useClusterAffinityGroups: () => state.groups,
}))

vi.mock('../../hooks/useClusterMutations', () => ({
  useDeleteAffinityGroup: () => ({ isPending: false, mutate: () => {} }),
}))

// Keep the modal + confirm dependency trees out of this suite — the tab only
// mounts them behind interaction state, which static render never reaches.
vi.mock('../affinity/AffinityGroupModal', () => ({ AffinityGroupModal: () => null }))
vi.mock('../ConfirmModal', () => ({ ConfirmModal: () => null }))

const { ClusterAffinityGroupsTab } = await import('./ClusterAffinityGroupsTab')

function asQuery(
  partial: Partial<UseQueryResult<ClusterAffinityGroup[], Error>>,
): UseQueryResult<ClusterAffinityGroup[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
    ...partial,
  } as unknown as UseQueryResult<ClusterAffinityGroup[], Error>
}

const GROUPS = [
  { id: 'ag-1', name: 'keep-web-together', positive: true, enforcing: true },
  { id: 'ag-2', name: 'split-db', positive: false, enforcing: false },
] as ClusterAffinityGroup[]

function render() {
  return renderToStaticMarkup(
    <ClusterAffinityGroupsTab clusterId="cluster-1" clusterName="Default" />,
  )
}

describe('ClusterAffinityGroupsTab', () => {
  it('renders the loading skeleton', () => {
    state.groups = asQuery({ isPending: true })
    expect(render()).toContain('Loading affinity groups')
  })

  it('renders the error state with a retry', () => {
    state.groups = asQuery({ isError: true, error: new Error('boom') })
    const html = render()
    expect(html).toContain('Could not load affinity groups')
    expect(html).toContain('boom')
    expect(html).toContain('Retry')
  })

  it('renders the empty state with a New call-to-action', () => {
    state.groups = asQuery({ isSuccess: true, data: [] })
    const html = render()
    expect(html).toContain('No affinity groups')
    expect(html).toContain('New affinity group')
  })

  it('renders the populated table with a New button, polarity, and per-row Edit/Remove kebab', () => {
    state.groups = asQuery({ isSuccess: true, data: GROUPS })
    const html = render()
    expect(html).toContain('New affinity group')
    expect(html).toContain('keep-web-together')
    expect(html).toContain('split-db')
    expect(html).toContain('Positive')
    expect(html).toContain('Negative')
    // every data row carries the Edit + Remove kebab
    expect(html.match(/aria-label="Row actions: Edit,Remove"/g)).toHaveLength(2)
    // the table is labelled and gets a dedicated actions header
    expect(html).toContain('aria-label="Affinity groups"')
    expect(html).toContain('<th>Actions</th>')
  })
})
