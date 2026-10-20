import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps, ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import type { ClusterCpuProfile } from '../../api/resources/clusters'
import type { DataCenterQos } from '../../api/resources/datacenters'
import { enMessages } from '../../i18n/messages/en'
import { dataCenterKeys } from '../../hooks/useAdminResources'

// vitest env is 'node' (no jsdom); PF react-core's node entry pulls raw .css
// node can't parse, so — like ClusterFormModal.test.tsx — the PF pieces are
// stubbed with semantic passthroughs that echo the props under test: the
// select's disabled/validated/value wiring, option value/label, helper-text
// variant. The QoS select is the shared forms/OptionsSelect, which renders its
// query state as helper text under the select — hence the HelperText stubs.
// No Skeleton stub on purpose: the modal no longer renders one, and vitest
// throws on a missing mock export, so a regression to the Skeleton branch (which
// hid a failed read behind an empty select) fails loudly.
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
  // Attribute order is fixed (id, disabled, validated, aria-label, value) so
  // the assertions below can pin "enabled" as the absence of `disabled`.
  FormSelect: ({
    id,
    isDisabled,
    validated,
    value,
    'aria-label': ariaLabel,
    children,
  }: {
    id?: string
    isDisabled?: boolean
    validated?: string
    value?: string
    'aria-label'?: string
    children?: ReactNode
  }) => (
    <select
      id={id}
      disabled={isDisabled}
      data-validated={validated}
      aria-label={ariaLabel}
      data-value={String(value)}
    >
      {children}
    </select>
  ),
  FormSelectOption: ({
    value,
    label,
    isDisabled,
  }: {
    value?: string
    label?: string
    isDisabled?: boolean
  }) => (
    <option value={String(value)} disabled={isDisabled}>
      {label}
    </option>
  ),
  FormHelperText: ({ children }: { children?: ReactNode }) => (
    <div className="form-helper">{children}</div>
  ),
  HelperText: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  HelperTextItem: ({ children, variant }: { children?: ReactNode; variant?: string }) => (
    <div data-variant={variant ?? 'default'}>{children}</div>
  ),
  Modal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  ModalHeader: ({ title }: { title?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  TextInput: ({
    id,
    value,
    'aria-label': ariaLabel,
    validated,
  }: {
    id?: string
    value?: string
    'aria-label'?: string
    validated?: string
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      value={String(value)}
      data-validated={validated ?? 'default'}
      readOnly
    />
  ),
}))

// The one useQuery the modal makes — the data center's QoS list. Only the
// structural OptionsQuery slice the select reads is modeled; `lastQuery`
// captures the options the modal passed so the key and the enabled gate can be
// asserted without a QueryClient.
const state = vi.hoisted(() => ({
  qoss: {
    data: undefined as DataCenterQos[] | undefined,
    isPending: true,
    isError: false,
    error: null as unknown,
    refetch: () => Promise.resolve(),
  },
  lastQuery: undefined as { queryKey: unknown[]; enabled?: boolean } | undefined,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[]; enabled?: boolean }) => {
    state.lastQuery = options
    return state.qoss
  },
}))

// The modal owns these two mutations; neither is exercised under
// renderToStaticMarkup (no clicks), so the objects are inert.
vi.mock('../../hooks/useClusterCpuProfileMutations', () => ({
  useCreateClusterCpuProfile: () => ({ mutate: () => {}, isPending: false }),
  useUpdateCpuProfile: () => ({ mutate: () => {}, isPending: false }),
}))

// listDataCenterQoss is referenced as queryFn only; the mocked useQuery never
// calls it, but the import must resolve.
vi.mock('../../api/resources/datacenters', () => ({
  listDataCenterQoss: () => Promise.resolve([]),
}))

const { CpuProfileFormModal } = await import('./CpuProfileFormModal')

type QosQuery = typeof state.qoss

const pending = (): QosQuery => ({
  data: undefined,
  isPending: true,
  isError: false,
  error: null,
  refetch: () => Promise.resolve(),
})
const failed = (message: string): QosQuery => ({
  data: undefined,
  isPending: false,
  isError: true,
  error: new Error(message),
  refetch: () => Promise.resolve(),
})
const loaded = (rows: DataCenterQos[]): QosQuery => ({
  data: rows,
  isPending: false,
  isError: false,
  error: null,
  refetch: () => Promise.resolve(),
})

// Mixed QoS kinds, because the select must narrow the DC list to type 'cpu'.
const GOLD: DataCenterQos = { id: 'qos-cpu-1', name: 'gold', type: 'cpu', cpu_limit: 80 }
const SILVER: DataCenterQos = { id: 'qos-cpu-2', name: 'silver', type: 'cpu', cpu_limit: 40 }
const WAN: DataCenterQos = { id: 'qos-net-1', name: 'wan-shaped', type: 'network' }

const PROFILE: ClusterCpuProfile = {
  id: 'cpu-profile-1',
  name: 'gold-tier',
  description: 'capped at 80%',
  qos: { id: 'qos-cpu-1' },
}

type Props = ComponentProps<typeof CpuProfileFormModal>

// Every label resolves through useT/react-intl, so the render needs an
// IntlProvider; the real en catalog keeps the English assertions meaningful.
function render(props: Partial<Props> = {}) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <CpuProfileFormModal clusterId="cluster-1" dcId="dc-1" isOpen onClose={() => {}} {...props} />
    </IntlProvider>,
  )
}

beforeEach(() => {
  state.qoss = pending()
  state.lastQuery = undefined
})

describe('CpuProfileFormModal — QoS read', () => {
  it('keys the read on the tab-shared literal and gates it on an open modal with a DC in hand', () => {
    render()
    expect(state.lastQuery?.queryKey).toEqual(dataCenterKeys.qosPicker('dc-1'))
    expect(state.lastQuery?.enabled).toBe(true)

    render({ dcId: '' })
    expect(state.lastQuery?.enabled).toBe(false)

    render({ isOpen: false })
    expect(state.lastQuery?.enabled).toBe(false)
  })

  it('renders the select disabled with the QoS loading hint while the read is pending', () => {
    const html = render()

    expect(html).toContain('<select id="cpu-profile-qos" disabled="" data-validated="default"')
    // the No QoS choice is the only option — no rows are invented while loading
    expect(html).toContain('<option value="">No QoS</option>')
    expect(html).not.toContain('<option value="qos-')
    expect(html).toContain('data-variant="indeterminate"')
    expect(html).toContain('Loading QoS profiles')
    expect(html).not.toContain('Retry')
  })

  it('swaps in the data-center hint while the tab has not resolved the DC yet', () => {
    const html = render({ dcId: '' })

    expect(html).toContain('<select id="cpu-profile-qos" disabled=""')
    expect(html).toContain('The data center is still loading its QoS profiles.')
    expect(html).not.toContain('Loading QoS profiles')
  })

  it('surfaces a failed read as an error line with the fault detail and a Retry — never as "no QoS"', () => {
    state.qoss = failed('HTTP 500 Internal Server Error')
    const html = render()

    expect(html).toContain('<select id="cpu-profile-qos" disabled="" data-validated="error"')
    expect(html).toContain('data-variant="error"')
    expect(html).toContain('Something went wrong: HTTP 500 Internal Server Error')
    expect(html).toMatch(/<button data-variant="link">Retry<\/button>/)
    expect(html).not.toContain('Nothing here yet')
    expect(html).not.toContain('Loading QoS profiles')
    // the No QoS choice still renders (a real '' option), but no rows are invented
    expect(html).toContain('<option value="">No QoS</option>')
    expect(html).not.toContain('<option value="qos-')
  })

  it('lets a failed read win over stale rows so they are never offered as current', () => {
    state.qoss = { ...failed('HTTP 502'), data: [GOLD] }
    const html = render()

    expect(html).toContain('data-validated="error"')
    expect(html).toContain('Retry')
    expect(html).not.toContain('<option value="qos-cpu-1"')
  })

  it('offers only the CPU-kind rows once loaded, after the No QoS choice, with no helper line', () => {
    state.qoss = loaded([GOLD, WAN, SILVER])
    const html = render({ profile: PROFILE })

    // enabled: no disabled attribute between id and validated
    expect(html).toContain('<select id="cpu-profile-qos" data-validated="default"')
    expect(html).toContain('<option value="qos-cpu-1">gold</option>')
    expect(html).toContain('<option value="qos-cpu-2">silver</option>')
    expect(html).not.toContain('qos-net-1')
    expect(html.indexOf('No QoS')).toBeLessThan(html.indexOf('>gold<'))
    expect(html).not.toContain('Loading')
    expect(html).not.toContain('Nothing here yet')
    expect(html).not.toContain('Retry')
    // edit mode with a name: the only helper text would have been the select's
    expect(html).not.toContain('form-helper')
  })

  it('tells a DC without CPU-kind QoS apart from a failed read', () => {
    state.qoss = loaded([WAN])
    const html = render()

    expect(html).toContain('<select id="cpu-profile-qos" data-validated="default"')
    expect(html).toContain('<option value="">No QoS</option>')
    expect(html).not.toContain('qos-net-1')
    expect(html).toContain('Nothing here yet')
    expect(html).not.toContain('Retry')
  })
})

describe('CpuProfileFormModal — modes', () => {
  it('titles New CPU profile with No QoS preselected and holds Save until a name is typed', () => {
    state.qoss = loaded([GOLD])
    const html = render()

    expect(html).toContain('New CPU profile')
    expect(html).toContain('aria-label="QoS" data-value=""')
    expect(html).toContain('A name is required.')
    expect(html).toContain('<button disabled="" data-variant="primary">Save</button>')
  })

  it('titles Edit with the profile name and seeds name / description / QoS from the read model', () => {
    state.qoss = loaded([GOLD, SILVER])
    const html = render({ profile: PROFILE })

    expect(html).toContain('Edit CPU profile — gold-tier')
    // React emits an input's `value` last, so match across the other attributes
    expect(html).toMatch(/aria-label="CPU profile name"[^>]*value="gold-tier"/)
    expect(html).toMatch(/aria-label="CPU profile description"[^>]*value="capped at 80%"/)
    expect(html).toContain('aria-label="QoS" data-value="qos-cpu-1"')
    expect(html).not.toContain('A name is required.')
    expect(html).toContain('<button data-variant="primary">Save</button>')
  })
})
