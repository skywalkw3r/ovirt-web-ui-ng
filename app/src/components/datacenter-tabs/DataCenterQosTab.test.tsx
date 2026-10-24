import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import type { UseQueryResult } from '@tanstack/react-query'
import type { DataCenterQos } from '../../api/resources/datacenters'
import { enMessages } from '../../i18n/messages/en'

// Node test env + PF CSS imports → stub PF with semantic passthroughs (the
// ClusterAffinityGroupsTab.test.tsx pattern). Assertions target the tab's
// composition: the four states, the type-choosing New menu (toolbar +
// empty-state CTA), the type filter, and the per-row Edit/Remove kebab — not
// PF markup.
vi.mock('@patternfly/react-core', () => ({
  Button: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    'aria-label'?: string
  }) => <button aria-label={ariaLabel}>{children}</button>,
  Dropdown: ({
    children,
    toggle,
  }: {
    children?: ReactNode
    toggle?: (ref: unknown) => ReactNode
  }) => (
    <div>
      {toggle?.(null)}
      {children}
    </div>
  ),
  DropdownItem: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  DropdownList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
  MenuToggle: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    'aria-label'?: string
  }) => <button aria-label={ariaLabel}>{children}</button>,
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  ToggleGroup: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    'aria-label'?: string
  }) => <div aria-label={ariaLabel}>{children}</div>,
  ToggleGroupItem: ({ text, isSelected }: { text?: string; isSelected?: boolean }) => (
    <button aria-pressed={isSelected}>{text}</button>
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
  ActionsColumn: ({ items }: { items: { title?: string }[] }) => (
    <button aria-label={`Row actions: ${items.map((item) => item.title).join(',')}`}>⋮</button>
  ),
}))

const state = vi.hoisted(() => ({
  qoss: {} as UseQueryResult<DataCenterQos[], Error>,
}))

vi.mock('../../hooks/useDataCenterDetail', () => ({
  useDataCenterQoss: () => state.qoss,
}))

vi.mock('../../hooks/useDataCenterQosMutations', () => ({
  useDeleteDataCenterQos: () => ({ isPending: false, mutate: () => {} }),
}))

// Keep the modal + confirm dependency trees out of this suite — the tab only
// mounts them behind interaction state, which static render never reaches.
vi.mock('../datacenter-qos-form/DataCenterQosFormModal', () => ({
  DataCenterQosFormModal: () => null,
}))
vi.mock('../ConfirmModal', () => ({ ConfirmModal: () => null }))

const { DataCenterQosTab } = await import('./DataCenterQosTab')

function asQuery(
  partial: Partial<UseQueryResult<DataCenterQos[], Error>>,
): UseQueryResult<DataCenterQos[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
    ...partial,
  } as unknown as UseQueryResult<DataCenterQos[], Error>
}

const QOSS: DataCenterQos[] = [
  { id: 'qos-net', name: 'net-cap', type: 'network', inbound_average: 512 },
  { id: 'qos-cpu', name: 'half-core', type: 'cpu', description: 'Half a vCPU', cpu_limit: 50 },
]

function render() {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <DataCenterQosTab dataCenterId="dc-01" />
    </IntlProvider>,
  )
}

describe('DataCenterQosTab', () => {
  it('renders the loading skeleton', () => {
    state.qoss = asQuery({ isPending: true })
    expect(render()).toContain('Loading QoS profiles')
  })

  it('renders the error state with a retry', () => {
    state.qoss = asQuery({ isError: true, error: new Error('boom') })
    const html = render()
    expect(html).toContain('Could not load QoS profiles')
    expect(html).toContain('boom')
    expect(html).toContain('Retry')
  })

  it('renders the empty state with the type-choosing New call-to-action', () => {
    state.qoss = asQuery({ isSuccess: true, data: [] })
    const html = render()
    expect(html).toContain('No QoS profiles')
    expect(html).toContain('New QoS profile')
    // all four types are offered
    expect(html).toContain('New Network QoS')
    expect(html).toContain('New Storage QoS')
    expect(html).toContain('New CPU QoS')
    expect(html).toContain('New Host Network QoS')
  })

  it('renders the populated table with filter, New menu, limits, and row kebabs', () => {
    state.qoss = asQuery({ isSuccess: true, data: QOSS })
    const html = render()
    // the type filter with the All entry pre-selected
    expect(html).toContain('aria-label="Filter QoS profiles by type"')
    expect(html).toContain('All types')
    // the toolbar New menu
    expect(html).toContain('New QoS profile')
    // both rows, their localized type labels, and their limit summaries
    expect(html).toContain('net-cap')
    expect(html).toContain('half-core')
    expect(html).toContain('Half a vCPU')
    expect(html).toContain('Inbound average (Mbps): 512')
    expect(html).toContain('CPU limit (%): 50')
    // every data row carries the Edit + Remove kebab
    expect(html.match(/aria-label="Row actions: Edit,Remove"/g)).toHaveLength(2)
    // the table is labelled and gets a dedicated actions header
    expect(html).toContain('aria-label="QoS profiles"')
    expect(html).toContain('<th>Actions</th>')
  })
})
