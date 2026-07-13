import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { StorageDomain } from '../../api/schemas/storage-domain'

// Node test env + PF CSS imports → stub PF with semantic passthroughs (the
// DataCenterQosTab.test.tsx pattern). Assertions target the tab's composition:
// the four states, the tab-level Attach control, and the per-row Activate /
// Maintenance / Detach kebab — not PF markup.
vi.mock('@patternfly/react-core', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
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
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  StackItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Toolbar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Progress: ({
    'aria-label': ariaLabel,
    valueText,
  }: {
    'aria-label'?: string
    valueText?: string
  }) => <div aria-label={ariaLabel}>{valueText}</div>,
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
  ActionsColumn: ({ items }: { items: { title?: string }[] }) => (
    <button aria-label={`Row actions: ${items.map((item) => item.title).join(',')}`}>⋮</button>
  ),
}))

vi.mock('../StatusBadge', () => ({
  StatusBadge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}))

// the Name cell links to the domain detail — static render has no router
// context, so stub Link as a bare anchor (same pattern as ClusterNetworksTab)
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))

// The tab only mounts these behind interaction state, which static render never
// reaches — keep their dependency trees out of the suite.
vi.mock('../ConfirmModal', () => ({ ConfirmModal: () => null }))
vi.mock('./AttachDataCenterStorageDomainModal', () => ({
  AttachDataCenterStorageDomainModal: () => null,
}))

const state = vi.hoisted(() => ({
  domains: {} as UseQueryResult<StorageDomain[], Error>,
}))

vi.mock('../../hooks/useDataCenterDetail', () => ({
  useDataCenterStorageDomains: () => state.domains,
}))

const noopMutation = { isPending: false, mutate: () => {} }
vi.mock('../../hooks/useStorageDomainMutations', () => ({
  useActivateStorageDomain: () => noopMutation,
  useDeactivateStorageDomain: () => noopMutation,
  useDetachStorageDomain: () => noopMutation,
}))

const { DataCenterStorageActionsTab } = await import('./DataCenterStorageActionsTab')

function asQuery(
  partial: Partial<UseQueryResult<StorageDomain[], Error>>,
): UseQueryResult<StorageDomain[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
    ...partial,
  } as unknown as UseQueryResult<StorageDomain[], Error>
}

const GiB = 1024 ** 3
const DOMAINS: StorageDomain[] = [
  {
    id: 'sd-01',
    name: 'nfs-data',
    type: 'data',
    master: true,
    status: 'active',
    storage: { type: 'nfs' },
    used: 90 * GiB,
    available: 210 * GiB,
  },
  {
    id: 'sd-02',
    name: 'iso-store',
    type: 'iso',
    status: 'maintenance',
    storage: { type: 'iscsi' },
  },
]

function render() {
  return renderToStaticMarkup(<DataCenterStorageActionsTab dataCenterId="dc-01" />)
}

describe('DataCenterStorageActionsTab', () => {
  it('renders the loading skeleton', () => {
    state.domains = asQuery({ isPending: true })
    expect(render()).toContain('Loading storage domains')
  })

  it('renders the error state with a retry', () => {
    state.domains = asQuery({ isError: true, error: new Error('boom') })
    const html = render()
    expect(html).toContain('Could not load storage domains')
    expect(html).toContain('boom')
    expect(html).toContain('Retry')
  })

  it('renders the empty state with an Attach call-to-action', () => {
    state.domains = asQuery({ isSuccess: true, data: [] })
    const html = render()
    expect(html).toContain('No storage domains')
    expect(html).toContain('Attach storage domain')
  })

  it('renders the populated table with the Attach toolbar and per-row lifecycle kebab', () => {
    state.domains = asQuery({ isSuccess: true, data: DOMAINS })
    const html = render()
    // both rows, their type and the tab-level attach control
    expect(html).toContain('nfs-data')
    expect(html).toContain('iso-store')
    expect(html).toContain('Attach storage domain')
    // parity columns: Domain type (master callout / ISO), Storage Type, and a
    // per-domain utilization bar
    expect(html).toContain('Domain type')
    expect(html).toContain('Storage Type')
    expect(html).toContain('Utilization')
    expect(html).toContain('Data (Master)')
    expect(html).toContain('ISO')
    expect(html).toContain('NFS')
    expect(html).toContain('iSCSI')
    expect(html).toContain('aria-label="nfs-data utilization"')
    // every data row carries the Activate/Maintenance/Detach kebab
    expect(html.match(/aria-label="Row actions: Activate,Maintenance,Detach"/g)).toHaveLength(2)
    // the table is labelled and gets a dedicated actions header
    expect(html).toContain('aria-label="Storage domains"')
    expect(html).toContain('<th>Actions</th>')
  })
})
