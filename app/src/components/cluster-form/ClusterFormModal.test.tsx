import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { ClusterSchema, type Cluster } from '../../api/schemas/cluster'
import { enMessages } from '../../i18n/messages/en'

// vitest env is 'node' (no jsdom); PF react-core's node entry pulls raw .css
// node can't parse, so — like DiskFormModal.test.tsx / AddPermissionModal.test
// .tsx — the PF pieces are stubbed with semantic passthroughs. The real
// ModalVerticalTabs is NOT stubbed, so its Flex/Tabs/Tab/TabTitleText usage must
// be covered here; Tab renders its `title` so every section label shows in the
// static markup, while only the first (General) section's body is rendered in
// the panel — which is why the edit-seed assertion targets a General-tab field
// (switch type). The Save-payload wiring is asserted against the modal's own
// exported buildSavePayload/clusterToDraft (the exact assembly Save calls),
// since renderToStaticMarkup fires no clicks.
vi.mock('@patternfly/react-core', () => ({
  Button: ({
    children,
    isDisabled,
    variant,
  }: {
    children?: ReactNode
    isDisabled?: boolean
    variant?: string
  }) => (
    <button disabled={isDisabled} data-variant={variant}>
      {children}
    </button>
  ),
  Flex: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  FlexItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Form: ({ children }: { children?: ReactNode }) => <form>{children}</form>,
  FormGroup: ({
    label,
    children,
    isRequired,
    fieldId,
  }: {
    label?: ReactNode
    children?: ReactNode
    isRequired?: boolean
    fieldId?: string
  }) => (
    <div data-field={fieldId} data-required={isRequired ? 'true' : 'false'}>
      {label !== undefined && <label>{label}</label>}
      {children}
    </div>
  ),
  FormSelect: ({
    children,
    value,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    value?: string
    'aria-label'?: string
  }) => (
    <select aria-label={ariaLabel} data-value={String(value)}>
      {children}
    </select>
  ),
  FormSelectOption: ({ value, label }: { value?: string; label?: string }) => (
    <option value={String(value)}>{label}</option>
  ),
  Modal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  ModalHeader: ({ title }: { title?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  Switch: ({ label, isChecked, id }: { label?: ReactNode; isChecked?: boolean; id?: string }) => (
    <label data-id={id} data-checked={isChecked ? 'true' : 'false'}>
      <input type="checkbox" checked={Boolean(isChecked)} readOnly />
      {label}
    </label>
  ),
  // ModalVerticalTabs owns the tab rail; Tab exposes its title so all six
  // section labels land in the static markup even though only General's body
  // renders in the panel.
  Tabs: ({ children }: { children?: ReactNode }) => <div role="tablist">{children}</div>,
  Tab: ({ title, id }: { title?: ReactNode; id?: string }) => <div data-tab={id}>{title}</div>,
  TabTitleText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: ({
    value,
    'aria-label': ariaLabel,
    readOnlyVariant,
  }: {
    value?: string
    'aria-label'?: string
    readOnlyVariant?: string
  }) => (
    <input
      aria-label={ariaLabel}
      value={String(value)}
      data-readonly={readOnlyVariant ?? ''}
      readOnly
    />
  ),
}))

// The three useQuery calls the modal makes, keyed by queryKey[0]. Only the
// four-state fields the modal reads are modeled. Non-pending empty lists keep
// the option selects and Skeleton branches inert for the composition assertions.
const state = vi.hoisted(() => ({
  datacenters: [] as { id: string; name?: string }[],
  schedulingPolicies: [] as { id: string; name?: string }[],
  macpools: [] as { id: string; name?: string }[],
  pending: false,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0]
    const data =
      key === 'datacenters'
        ? state.datacenters
        : key === 'schedulingPolicies'
          ? state.schedulingPolicies
          : state.macpools
    return {
      data,
      isPending: state.pending,
      isError: false,
      isSuccess: !state.pending,
      error: null,
      refetch: () => Promise.resolve(),
    }
  },
}))

// The modal owns these two mutations; neither is exercised under
// renderToStaticMarkup (no clicks), so the objects are inert.
vi.mock('../../hooks/useClusterMutations', () => ({
  useCreateCluster: () => ({ mutate: () => {}, isPending: false }),
  useUpdateCluster: () => ({ mutate: () => {}, isPending: false }),
}))

// The option-list resource fns are referenced as queryFn only; the mocked
// useQuery never calls them, but the import must resolve.
vi.mock('../../api/resources/datacenters', () => ({ listDataCenters: () => Promise.resolve([]) }))

const { ClusterFormModal } = await import('./ClusterFormModal')
// The pure draft/payload layer lives in its own module (keeps the component file
// component-only for Fast Refresh); import the builders under test from there.
const { buildSavePayload, clusterToDraft } = await import('./clusterDraft')

// An edit-mode fixture exercising every deepened sub-block, parsed through the
// real ClusterSchema from the live engine's mixed string/number scalar forms so
// CLUSTER is a genuinely coerced read model — exactly what the modal receives.
// This also proves the string→boolean/number coercion end to end (seed-direct).
const CLUSTER: Cluster = ClusterSchema.parse({
  id: 'cluster-1',
  name: 'prod',
  description: 'production cluster',
  cpu: { type: 'Secure Intel Icelake Server Family' },
  version: { major: 4, minor: 8 },
  data_center: { id: 'dc-1', name: 'Default' },
  memory_policy: { over_commit: { percent: '150' } },
  ballooning_enabled: 'true',
  switch_type: 'ovs',
  firewall_type: 'nftables',
  scheduling_policy: { id: 'sp-42' },
  migration: { bandwidth: { assignment_method: 'custom', custom_value: '512' } },
  fencing_policy: {
    enabled: 'true',
    skip_if_sd_active: { enabled: 'false' },
    skip_if_connectivity_broken: { enabled: 'true', threshold: '75' },
  },
  display: { proxy: 'spice://proxy.lab.local:3128' },
  mac_pool: { id: 'macpool-7' },
})

// ClusterFormModal reads every label through useT/useIntl, so the render needs
// an IntlProvider; feeding it the real en catalog keeps the English assertions
// below meaningful (the section titles and buttons resolve to their en values).
function renderCreate() {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <ClusterFormModal isOpen onClose={() => {}} />
    </IntlProvider>,
  )
}

function renderEdit(cluster: Cluster) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <ClusterFormModal cluster={cluster} isOpen onClose={() => {}} />
    </IntlProvider>,
  )
}

describe('ClusterFormModal — layout', () => {
  it('renders all six vertical-tab section titles', () => {
    const html = renderCreate()

    expect(html).toContain('General')
    expect(html).toContain('Optimization')
    expect(html).toContain('Migration')
    expect(html).toContain('Fencing policy')
    expect(html).toContain('Console')
    expect(html).toContain('MAC address pool')
  })

  it('titles New cluster in create mode with a Save action', () => {
    const html = renderCreate()

    expect(html).toContain('New cluster')
    expect(html).toContain('>Save</button>')
  })
})

describe('ClusterFormModal — edit seeding', () => {
  it('titles Edit with the cluster name and seeds the General-tab deep field (switch type) from the read model', () => {
    const html = renderEdit(CLUSTER)

    expect(html).toContain('Edit cluster — prod')
    // switch type lives on the default-rendered General tab; seeded to the
    // cluster's ovs value (not the create default of legacy)
    expect(html).toContain('aria-label="Switch type"')
    expect(html).toMatch(/aria-label="Switch type" data-value="ovs"/)
    // and the base General fields still prefill
    expect(html).toContain('value="prod"')
    expect(html).toMatch(/aria-label="Firewall type" data-value="nftables"/)
  })
})

// The modal's Save calls buildSavePayload(clusterToDraft(cluster), true); these
// assert the assembled body carries the deepened sub-blocks with omit-unchanged
// discipline (the resource-layer clusters.test.ts covers buildClusterExtras in
// isolation — here we prove the modal wires the whole path).
describe('ClusterFormModal — save payload wiring', () => {
  it('assembles a deep-keyed body from an edit-mode draft', () => {
    const payload = buildSavePayload(clusterToDraft(CLUSTER), true) as Record<string, unknown>

    // base fields
    expect(payload.name).toBe('prod')
    expect(payload.version).toEqual({ major: 4, minor: 8 })
    // data_center is create-only — never in an edit body
    expect(payload.data_center).toBeUndefined()

    // deepened sub-blocks (the load-bearing deep keys)
    expect(payload.switch_type).toBe('ovs')
    expect(payload.firewall_type).toBe('nftables')
    expect(payload.scheduling_policy).toEqual({ id: 'sp-42' })
    expect(payload.mac_pool).toEqual({ id: 'macpool-7' })
    expect(payload.migration).toEqual({
      bandwidth: { assignment_method: 'custom', custom_value: 512 },
    })
    expect(payload.fencing_policy).toEqual({
      enabled: true,
      skip_if_sd_active: { enabled: false },
      skip_if_connectivity_broken: { enabled: true, threshold: 75 },
    })
    expect(payload.display).toEqual({ proxy: 'spice://proxy.lab.local:3128' })
  })

  it('omits inherit scheduling policy / MAC pool and clears an unset SPICE proxy in create mode', () => {
    // clusterToDraft({}) yields the same deep-field inherit values the modal's
    // create path (blankDraft) does: empty scheduling/MAC ⇒ omitted, and the
    // webadmin defaults for switch/firewall/fencing/bandwidth.
    const create = buildSavePayload(clusterToDraft({} as Cluster), false) as Record<string, unknown>

    // scheduling policy + MAC pool stay at inherit ('') so they are omitted, not
    // sent as empty ids
    expect(create.scheduling_policy).toBeUndefined()
    expect(create.mac_pool).toBeUndefined()
    // webadmin create defaults ride
    expect(create.switch_type).toBe('legacy')
    expect(create.firewall_type).toBe('firewalld')
    expect(create.migration).toEqual({ bandwidth: { assignment_method: 'auto' } })
    // fencing default: enabled + skip-if-SD-active, skip-if-conn-broken off (so
    // no threshold rides)
    expect(create.fencing_policy).toEqual({
      enabled: true,
      skip_if_sd_active: { enabled: true },
      skip_if_connectivity_broken: { enabled: false },
    })
    // SPICE override off ⇒ cleared with an empty-string proxy (clear-to-none)
    expect(create.display).toEqual({ proxy: '' })
  })
})
