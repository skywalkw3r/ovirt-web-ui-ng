import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Vm } from '../../api/schemas/vm'
import { enMessages } from '../../i18n/messages/en'

// Node test env + PF CSS imports → stub PF with semantic passthroughs (the
// ClusterAffinityGroupsTab.test.tsx pattern). Assertions target the shell's
// composition — the five states, per-column widths/truncation, the toolbar
// slot — not PF markup.
vi.mock('@patternfly/react-core', () => ({
  Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) => (
    <div>
      <h4>{titleText}</h4>
      {children}
    </div>
  ),
  EmptyStateBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  EmptyStateFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  EmptyStateActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  Pagination: ({ itemCount, perPage }: { itemCount?: number; perPage?: number }) => (
    <nav data-item-count={itemCount} data-per-page={perPage} />
  ),
  Toolbar: ({ children }: { children?: ReactNode }) => <div data-toolbar>{children}</div>,
  ToolbarContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../list-toolbar/SearchInput', () => ({
  SearchInput: ({ value, ariaLabel }: { value?: string; ariaLabel?: string }) => (
    <input aria-label={ariaLabel} defaultValue={value} />
  ),
}))

vi.mock('@patternfly/react-table', () => ({
  Table: ({
    children,
    className,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    className?: string
    'aria-label'?: string
  }) => (
    <table aria-label={ariaLabel} className={className}>
      {children}
    </table>
  ),
  Thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  Tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  Tr: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
  Th: ({ children, width }: { children?: ReactNode; width?: number }) => (
    <th data-width={width}>{children}</th>
  ),
  Td: ({
    children,
    dataLabel,
    modifier,
    title,
  }: {
    children?: ReactNode
    dataLabel?: string
    modifier?: string
    title?: string
  }) => (
    <td data-label={dataLabel} data-modifier={modifier} title={title}>
      {children}
    </td>
  ),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))

vi.mock('../list-toolbar/ResizableTh', () => ({
  resizableTableProps: () => ({ className: 'app-table-fixed' }),
  ResizableTh: ({ children, columnKey }: { children?: ReactNode; columnKey?: string }) => (
    <th data-resizable={columnKey}>{children}</th>
  ),
}))

vi.mock('../VmStatusLabel', () => ({
  VmStatusLabel: ({ status }: { status?: string }) => <span>status:{status}</span>,
}))

const { VM_NAME_COLUMN, VM_STATUS_COLUMN } = await import('./columns')
const { VmMembershipTable } = await import('./VmMembershipTable')
type VmMembershipColumn = import('./columns').VmMembershipColumn

function asQuery(partial: Partial<UseQueryResult<Vm[], Error>>): UseQueryResult<Vm[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    refetch: () => Promise.resolve(),
    ...partial,
  } as unknown as UseQueryResult<Vm[], Error>
}

const VMS = [
  { id: 'vm-1', name: 'web-01', status: 'up', description: 'front tier' },
  { id: 'vm-2', name: 'db-01', status: 'down', description: undefined, comment: 'standby' },
] as unknown as Vm[]

const COLUMNS: VmMembershipColumn[] = [
  { ...VM_NAME_COLUMN, width: 30 },
  VM_STATUS_COLUMN,
  {
    key: 'description',
    label: 'Description',
    modifier: 'truncate',
    title: (vm) => vm.description ?? vm.comment ?? undefined,
    render: (vm) => vm.description ?? vm.comment ?? '—',
  },
]

function render(query: UseQueryResult<Vm[], Error>, toolbarItems?: ReactNode) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <VmMembershipTable
        query={query}
        columns={COLUMNS}
        ariaLabel="Virtual machines in this cluster"
        emptyBody="No virtual machines are running in this cluster."
        toolbarItems={toolbarItems}
      />
    </IntlProvider>,
  )
}

describe('VmMembershipTable', () => {
  it('renders the loading skeleton', () => {
    expect(render(asQuery({ isPending: true }))).toContain('Loading virtual machines')
  })

  it('renders the error state with a retry', () => {
    const html = render(asQuery({ isError: true, error: new Error('boom') }))
    expect(html).toContain('Could not load virtual machines')
    expect(html).toContain('boom')
    expect(html).toContain('Retry')
  })

  it('renders the empty state with the per-parent body text, without the toolbar', () => {
    const html = render(asQuery({ isSuccess: true, data: [] }), <div>toolbar-marker</div>)
    expect(html).toContain('No virtual machines')
    expect(html).toContain('No virtual machines are running in this cluster.')
    expect(html).not.toContain('toolbar-marker')
  })

  it('renders the populated table from the column defs, toolbar above', () => {
    const html = render(asQuery({ isSuccess: true, data: VMS }), <div>toolbar-marker</div>)
    expect(html).toContain('toolbar-marker')
    // the shell's own toolbar: filter box + pagination over the matched rows,
    // caller items alongside
    expect(html).toContain('aria-label="Search virtual machines"')
    expect(html).toContain('data-item-count="2"')
    expect(html).toContain('aria-label="Virtual machines in this cluster"')
    // header cells carry the per-column widths
    expect(html).toContain('<th data-width="30">Name</th>')
    expect(html).toContain('<th>Status</th>')
    // rows render each column's cell: linked name, status label, description
    // with comment fallback + truncate/full-text-on-hover
    expect(html).toContain('<a>web-01</a>')
    expect(html).toContain('status:down')
    expect(html).toContain('data-modifier="truncate" title="front tier"')
    expect(html).toContain('title="standby"')
    expect(html).toContain('>standby</td>')
  })

  it('pages the rows, counting every match but rendering one page of them', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `vm-${index}`,
      name: `web-${String(index).padStart(2, '0')}`,
      status: 'up',
    })) as unknown as Vm[]
    const html = render(asQuery({ isSuccess: true, data: many }))
    // pagination reports the full match count at the default page size…
    expect(html).toContain('data-item-count="60"')
    expect(html).toContain('data-per-page="50"')
    // …while the table body holds only the first page
    expect(html).toContain('<a>web-49</a>')
    expect(html).not.toContain('<a>web-50</a>')
    expect(html.match(/<tr>/g)).toHaveLength(51) // 50 rows + the header row
  })

  it('switches to resizable headers inside a scroll viewport when resizePrefs is set', () => {
    const prefs = { visible: new Set(), widths: {}, hasWidths: false } as never
    const html = renderToStaticMarkup(
      <IntlProvider locale="en" messages={enMessages}>
        <VmMembershipTable
          query={asQuery({ isSuccess: true, data: VMS })}
          columns={COLUMNS}
          ariaLabel="Virtual machines consuming this quota"
          emptyBody="No virtual machine consumes this quota."
          resizePrefs={prefs}
        />
      </IntlProvider>,
    )
    expect(html).toContain('class="app-table-viewport"')
    expect(html).toContain('class="app-table-fixed"')
    expect(html).toContain('data-resizable="name"')
    expect(html).toContain('data-resizable="description"')
    expect(html).not.toContain('data-width')
  })
})
