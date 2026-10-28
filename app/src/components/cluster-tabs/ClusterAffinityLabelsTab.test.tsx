import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IntlProvider } from 'react-intl'
import { enMessages } from '../../i18n/messages/en'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { AffinityLabel } from '../../api/resources/clusters'

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
  labels: {} as UseQueryResult<AffinityLabel[], Error>,
}))

// The tab also builds the modal's cluster-scoped VM/host candidate queries from
// these hooks (idle until a modal opens); stub them so the tab renders under
// node without a QueryClient.
vi.mock('../../hooks/useClusterDetail', () => ({
  useClusterAffinityLabels: () => state.labels,
  useClusterVms: () => ({ isPending: true, data: undefined }),
  useClusterHosts: () => ({ isPending: true, data: undefined }),
}))

vi.mock('../../hooks/useClusterMutations', () => ({
  useDeleteAffinityLabel: () => ({ isPending: false, mutate: () => {} }),
}))

// Keep the modal + confirm dependency trees out of this suite — the tab only
// mounts them behind interaction state, which static render never reaches.
vi.mock('../affinity/AffinityLabelModal', () => ({ AffinityLabelModal: () => null }))
vi.mock('../ConfirmModal', () => ({ ConfirmModal: () => null }))

const { ClusterAffinityLabelsTab } = await import('./ClusterAffinityLabelsTab')

function asQuery(
  partial: Partial<UseQueryResult<AffinityLabel[], Error>>,
): UseQueryResult<AffinityLabel[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
    ...partial,
  } as unknown as UseQueryResult<AffinityLabel[], Error>
}

const LABELS = [
  { id: 'al-1', name: 'gpu' },
  { id: 'al-2', name: 'ssd' },
] as AffinityLabel[]

function render() {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <ClusterAffinityLabelsTab clusterId="cluster-1" clusterName="Default" />
    </IntlProvider>,
  )
}

describe('ClusterAffinityLabelsTab', () => {
  it('renders the loading skeleton', () => {
    state.labels = asQuery({ isPending: true })
    expect(render()).toContain('Loading affinity labels')
  })

  it('renders the error state with a retry', () => {
    state.labels = asQuery({ isError: true, error: new Error('boom') })
    const html = render()
    expect(html).toContain('Could not load affinity labels')
    expect(html).toContain('boom')
    expect(html).toContain('Retry')
  })

  it('renders the empty state with a New call-to-action', () => {
    state.labels = asQuery({ isSuccess: true, data: [] })
    const html = render()
    expect(html).toContain('No affinity labels')
    expect(html).toContain('New affinity label')
  })

  it('renders the populated table with a New button and per-row Edit/Remove kebab', () => {
    state.labels = asQuery({ isSuccess: true, data: LABELS })
    const html = render()
    expect(html).toContain('New affinity label')
    expect(html).toContain('gpu')
    expect(html).toContain('ssd')
    // every data row carries the Edit + Remove kebab
    expect(html.match(/aria-label="Row actions: Edit,Remove"/g)).toHaveLength(2)
    // the table is labelled and gets a dedicated actions header
    expect(html).toContain('aria-label="Affinity labels"')
    expect(html).toContain('<th>Actions</th>')
  })
})
