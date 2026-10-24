import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Network } from '../../api/schemas/network'
import { enMessages } from '../../i18n/messages/en'

// vitest env is 'node' (no jsdom) and PF react-core's node entry pulls raw .css
// node can't parse, so — like ClusterAffinityGroupsTab.test.tsx — the PF pieces
// are stubbed with semantic passthroughs. Checkbox renders its aria-label plus a
// compact `=on/off`/`disabled` marker so the static markup carries each toggle's
// resolved state (renderToStaticMarkup fires no clicks). The single-holder
// radio logic + the attach/update/detach diff are asserted against the modal's
// own exported toggleRole/computeChange — the exact functions the UI drives.
vi.mock('@patternfly/react-core', () => ({
  Button: ({ children, isDisabled }: { children?: ReactNode; isDisabled?: boolean }) => (
    <button disabled={isDisabled}>{children}</button>
  ),
  Checkbox: ({
    'aria-label': ariaLabel,
    isChecked,
    isDisabled,
  }: {
    'aria-label'?: string
    isChecked?: boolean
    isDisabled?: boolean
  }) => <span>{`[${ariaLabel}=${isChecked ? 'on' : 'off'}${isDisabled ? ' disabled' : ''}]`}</span>,
  EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) => (
    <div>
      <h4>{titleText}</h4>
      {children}
    </div>
  ),
  EmptyStateBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Modal: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ title }: { title?: ReactNode }) => <h2>{title}</h2>,
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
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

const state = vi.hoisted(() => ({
  networks: {} as UseQueryResult<Network[], Error>,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.networks,
  useMutation: () => ({ isPending: false, mutate: () => {} }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}))

vi.mock('../../notifications/context', () => ({ useNotify: () => ({ notify: () => {} }) }))

const { toggleRole, computeChange, ROLE_USAGES } = await import('./clusterNetworkRoles')
const { ManageClusterNetworksModal } = await import('./ManageClusterNetworksModal')

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

const DC_NETWORKS = [
  { id: 'net-01', name: 'ovirtmgmt' },
  { id: 'net-02', name: 'vm-prod' },
] as Network[]

// net-01 is the management network: attached, required, carrying migration +
// default_route (and the fixed vm/management usages). net-02 is unattached.
const ATTACHED = [
  {
    id: 'net-01',
    name: 'ovirtmgmt',
    required: true,
    usages: { usage: ['vm', 'management', 'migration', 'default_route'] },
  },
] as Network[]

// The modal reads every label through useT/useIntl, so the render needs an
// IntlProvider; the real en catalog keeps the English assertions meaningful.
function render() {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <ManageClusterNetworksModal
        clusterId="cluster-01"
        dataCenterId="dc-01"
        attached={ATTACHED}
        onClose={() => {}}
      />
    </IntlProvider>,
  )
}

describe('ROLE_USAGES', () => {
  it('covers exactly the four toggleable cluster roles', () => {
    expect([...ROLE_USAGES]).toEqual(['display', 'migration', 'gluster', 'default_route'])
  })
})

describe('toggleRole (single-holder radio semantics)', () => {
  it('moves a role off the previous holder when set on another network', () => {
    const rows = {
      a: { attached: true, required: false, usages: ['display'] },
      b: { attached: true, required: false, usages: [] },
    }
    const next = toggleRole(rows, 'b', 'display', true)
    expect(next.b.usages).toContain('display')
    expect(next.a.usages).not.toContain('display')
  })

  it('preserves vm/management on the losing holder when a role moves', () => {
    const rows = {
      mgmt: { attached: true, required: true, usages: ['vm', 'management', 'migration'] },
      other: { attached: true, required: false, usages: [] },
    }
    const next = toggleRole(rows, 'other', 'migration', true)
    expect(next.mgmt.usages).toEqual(['vm', 'management'])
    expect(next.other.usages).toContain('migration')
  })

  it('clears a role when unchecked without touching other networks', () => {
    const rows = {
      a: { attached: true, required: false, usages: ['gluster'] },
      b: { attached: true, required: false, usages: ['display'] },
    }
    const next = toggleRole(rows, 'a', 'gluster', false)
    expect(next.a.usages).not.toContain('gluster')
    expect(next.b.usages).toEqual(['display'])
  })

  it('is a no-op on a detached network', () => {
    const rows = { a: { attached: false, required: false, usages: [] } }
    expect(toggleRole(rows, 'a', 'display', true)).toBe(rows)
  })
})

describe('computeChange (attach/update/detach diff)', () => {
  const networks = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
  ]

  it('classifies attach, required-update, and detach in one pass', () => {
    const initial = {
      a: { attached: true, required: true, usages: ['vm', 'management'] },
      b: { attached: true, required: false, usages: [] },
      c: { attached: true, required: false, usages: [] },
    }
    const resolved = {
      a: { attached: true, required: true, usages: ['vm', 'management'] },
      b: { attached: true, required: true, usages: [] },
      c: { attached: false, required: false, usages: [] },
      d: { attached: true, required: false, usages: ['display'] },
    }
    const diff = computeChange(networks, initial, resolved)
    expect(diff.attach).toEqual([
      { networkId: 'd', name: 'D', required: false, usages: ['display'] },
    ])
    expect(diff.update).toEqual([{ networkId: 'b', name: 'B', required: true, usages: [] }])
    expect(diff.detach).toEqual([{ networkId: 'c', name: 'C' }])
  })

  it('emits an update when only the usages change', () => {
    const initial = { a: { attached: true, required: false, usages: ['migration'] } }
    const resolved = { a: { attached: true, required: false, usages: ['default_route'] } }
    const diff = computeChange([{ id: 'a', name: 'A' }], initial, resolved)
    expect(diff.update).toEqual([
      { networkId: 'a', name: 'A', required: false, usages: ['default_route'] },
    ])
  })

  it('treats usage lists as sets so reordering is not a change', () => {
    const initial = { a: { attached: true, required: false, usages: ['vm', 'management'] } }
    const resolved = { a: { attached: true, required: false, usages: ['management', 'vm'] } }
    expect(computeChange([{ id: 'a', name: 'A' }], initial, resolved).update).toEqual([])
  })
})

describe('ManageClusterNetworksModal', () => {
  it('renders the loading skeleton', () => {
    state.networks = asQuery({ isPending: true })
    expect(render()).toContain('Loading networks')
  })

  it('renders the error state with a retry', () => {
    state.networks = asQuery({ isError: true, error: new Error('boom') })
    const html = render()
    expect(html).toContain('Could not load networks')
    expect(html).toContain('boom')
    expect(html).toContain('Retry')
  })

  it('renders the empty state', () => {
    state.networks = asQuery({ isSuccess: true, data: [] })
    expect(render()).toContain('No networks')
  })

  it('renders every role column and reflects the attachment usages', () => {
    state.networks = asQuery({ isSuccess: true, data: DC_NETWORKS })
    const html = render()
    // the four role columns webadmin exposes
    expect(html).toContain('Display')
    expect(html).toContain('Migration')
    expect(html).toContain('Gluster')
    expect(html).toContain('Default route')
    // net-01 holds migration + default_route (checked), not display/gluster
    expect(html).toContain('[Migration network ovirtmgmt=on]')
    expect(html).toContain('[Default route network ovirtmgmt=on]')
    expect(html).toContain('[Display network ovirtmgmt=off]')
    expect(html).toContain('[Gluster network ovirtmgmt=off]')
    expect(html).toContain('[Required ovirtmgmt=on]')
    // net-02 is unattached, so its role + required toggles are disabled
    expect(html).toContain('[Attach vm-prod=off]')
    expect(html).toContain('[Display network vm-prod=off disabled]')
    expect(html).toContain('[Required vm-prod=off disabled]')
    expect(html).toContain('aria-label="Data center networks"')
  })
})
