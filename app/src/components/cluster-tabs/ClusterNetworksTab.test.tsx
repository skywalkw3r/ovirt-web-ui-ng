import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  EmptyStateFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  EmptyStateActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  // records each switch's props so a test can flip it without a DOM
  Switch: (props: {
    id: string
    'aria-label'?: string
    isChecked?: boolean
    isDisabled?: boolean
    onChange: (event: unknown, checked: boolean) => void
  }) => {
    captured.switches.set(props['aria-label'] ?? props.id, props)
    return (
      <input
        type="checkbox"
        aria-label={props['aria-label']}
        defaultChecked={props.isChecked}
        disabled={props.isDisabled}
      />
    )
  },
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
  Th: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  Td: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
  // records each row's kebab items (in render order) so a test can read and
  // fire them without opening the menu
  ActionsColumn: ({ items }: { items: CapturedAction[] }) => {
    captured.kebabs.push(items)
    return <td>kebab</td>
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))

// The column picker is a dropdown (not reachable under renderToStaticMarkup);
// stub it away — useColumnPrefs' all-visible default keeps every cell
// assertable below. Resizable headers reduce to plain <th> so the existing
// '<th>Roles</th>' assertion keeps passing (the DisksTab.test.tsx pattern).
vi.mock('../list-toolbar/ColumnPicker', () => ({ ColumnPicker: () => null }))

vi.mock('../list-toolbar/ResizableTh', () => ({
  resizableTableProps: () => ({}),
  ResizableTh: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
}))

// useColumnPrefs reads localStorage on mount; vitest runs in a node
// environment, so stub the minimal surface columnPrefs.ts touches, backed by
// an in-memory map (the bookmarks.test.ts pattern).
let storage: Map<string, string>

beforeEach(() => {
  storage = new Map()
  captured.switches.clear()
  captured.kebabs = []
  state.update.mockReset()
  state.detach.mockReset()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

interface CapturedAction {
  title?: ReactNode
  isDisabled?: boolean
  isDanger?: boolean
  isSeparator?: boolean
  onClick?: () => void
}

const captured = vi.hoisted(() => ({
  switches: new Map<
    string,
    {
      isChecked?: boolean
      isDisabled?: boolean
      onChange: (event: unknown, checked: boolean) => void
    }
  >(),
  kebabs: [] as CapturedAction[][],
}))

const state = vi.hoisted(() => ({
  networks: {} as UseQueryResult<Network[], Error>,
  update: vi.fn(),
  detach: vi.fn(),
}))

vi.mock('../../hooks/useClusterDetail', () => ({
  useClusterNetworks: () => state.networks,
  useUpdateClusterNetwork: () => ({ mutate: state.update, isPending: false }),
  useDetachClusterNetwork: () => ({ mutate: state.detach, isPending: false }),
}))

vi.mock('../ConfirmModal', () => ({ ConfirmModal: () => null }))

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
  {
    id: 'net-09',
    name: 'ext-overlay',
    required: false,
    usages: { usage: ['vm'] },
    external_provider: { id: 'provider-1' },
  },
] as Network[]

const itemTitled = (items: CapturedAction[], title: string) => {
  const item = items.find((candidate) => candidate.title === title)
  if (item === undefined) throw new Error(`no kebab item ${title}`)
  return item
}

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

  it('edits Required in place with a required-only PUT and locks the engine-refused rows', () => {
    state.networks = asQuery({ isSuccess: true, data: NETWORKS })
    render()

    // the management network must stay required; an external one can't be
    const management = captured.switches.get('Required ovirtmgmt')
    expect(management?.isChecked).toBe(true)
    expect(management?.isDisabled).toBe(true)
    expect(captured.switches.get('Required ext-overlay')?.isDisabled).toBe(true)

    const storageSwitch = captured.switches.get('Required storage')
    expect(storageSwitch?.isDisabled).toBe(false)
    storageSwitch?.onChange({}, true)
    // only `required` rides the PUT, so a stale row can't write roles back
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ networkId: 'net-03', attachment: { required: true } }),
    )
  })

  it('moves a single-holder role onto a network from its row kebab', () => {
    state.networks = asQuery({ isSuccess: true, data: NETWORKS })
    render()
    const [mgmtItems, storageItems, externalItems] = captured.kebabs

    // roles the network already holds are disabled, as is detaching management
    expect(itemTitled(mgmtItems!, 'Use for migration').isDisabled).toBe(true)
    expect(itemTitled(mgmtItems!, 'Use as default route').isDisabled).toBe(true)
    expect(itemTitled(mgmtItems!, 'Detach from cluster').isDisabled).toBe(true)
    // an external network can't carry display
    expect(itemTitled(externalItems!, 'Use for display').isDisabled).toBe(true)

    const display = itemTitled(storageItems!, 'Use for display')
    expect(display.isDisabled).toBe(false)
    display.onClick?.()
    // one PUT on the new holder: the engine strips the role from the old one
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ networkId: 'net-03', attachment: { usages: ['display'] } }),
    )
    expect(itemTitled(storageItems!, 'Detach from cluster').isDanger).toBe(true)
  })
})
