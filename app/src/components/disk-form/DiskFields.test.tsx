import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IntlProvider } from 'react-intl'
import type { ReactNode } from 'react'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { enMessages } from '../../i18n/messages/en'

// The image-disk fields AddDiskModal and DiskFormModal share. vitest env is
// 'node' (no jsdom); PF is stubbed with semantic passthroughs (the
// DiskFormModal.test.tsx set) so the assertions target composition — element
// ids following the caller's prefix, the label ids each dialog passes in, the
// allocation lock/default helper, the size validation, the profile select's
// disabled/default posture — not PF markup or interaction.
vi.mock('@patternfly/react-core', () => ({
  Button: ({ children, isDisabled }: { children?: ReactNode; isDisabled?: boolean }) => (
    <button disabled={isDisabled}>{children}</button>
  ),
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
  FormHelperText: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  FormSelect: ({
    children,
    value,
    id,
    'aria-label': ariaLabel,
    isDisabled,
  }: {
    children?: ReactNode
    value?: string
    id?: string
    'aria-label'?: string
    isDisabled?: boolean
  }) => (
    <select id={id} aria-label={ariaLabel} data-value={String(value)} disabled={isDisabled}>
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
  HelperText: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  HelperTextItem: ({ children, variant }: { children?: ReactNode; variant?: string }) => (
    <div data-variant={variant}>{children}</div>
  ),
  NumberInput: ({
    value,
    inputName,
    inputAriaLabel,
    validated,
    min,
  }: {
    value?: number | ''
    inputName?: string
    inputAriaLabel?: string
    validated?: string
    min?: number
  }) => (
    <input
      type="number"
      name={inputName}
      aria-label={inputAriaLabel}
      value={String(value)}
      min={min}
      data-validated={validated}
      readOnly
    />
  ),
  Radio: ({
    label,
    isChecked,
    isDisabled,
    id,
    name,
  }: {
    label?: ReactNode
    isChecked?: boolean
    isDisabled?: boolean
    id?: string
    name?: string
  }) => (
    <label data-id={id} data-name={name} data-checked={isChecked ? 'true' : 'false'}>
      <input type="radio" checked={Boolean(isChecked)} disabled={Boolean(isDisabled)} readOnly />
      {label}
    </label>
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
}))

const state = vi.hoisted(() => ({
  profiles: [] as unknown[],
  profilesPending: false,
}))

vi.mock('../../hooks/useDiskMutations', () => ({
  useStorageDomainDiskProfiles: () => ({
    isPending: state.profilesPending,
    isError: false,
    isSuccess: !state.profilesPending,
    data: state.profiles,
    error: null,
  }),
}))

const {
  AllocationField,
  DiskProfileField,
  DiskSizeField,
  DiskSwitchField,
  DiskTypeField,
  StorageDomainField,
} = await import('./DiskFields')
const { resolveAllocation } = await import('./diskFormModel')

function render(node: ReactNode): string {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      {node}
    </IntlProvider>,
  )
}

const noop = () => {}

// A storage-domains query in each of its three states (a plain object stands
// in for the TanStack result; the field reads only these flags).
type DomainsQuery = Parameters<typeof StorageDomainField>[0]['domains']
const domainsQuery = (overrides: Record<string, unknown>): DomainsQuery =>
  ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data: [],
    error: null,
    refetch: () => Promise.resolve(),
    ...overrides,
  }) as unknown as DomainsQuery
const domainsSuccess = (data: unknown[]) => domainsQuery({ data })

const nfs = { id: 'sd-01', name: 'nfs-data', type: 'data', storage: { type: 'nfs' } }
const iscsi = { id: 'sd-02', name: 'iscsi-data', type: 'data', storage: { type: 'iscsi' } }
const cinder = {
  id: 'sd-03',
  name: 'cinder',
  type: 'data',
  storage: { type: 'managed_block_storage' },
}

// The two dialogs' own wording for the shared fields — the floating-disk
// form's ids here; AddDiskModal passes the vmDisks.addModal.* twins.
const ALLOCATION_LABELS = {
  group: 'diskForm.allocation',
  thin: 'diskForm.allocation.thin',
  managedBlock: 'diskForm.allocation.managedBlock',
  blockDefault: 'diskForm.allocation.blockDefault',
  format: 'diskForm.format.label',
  qcow2: 'diskForm.format.qcow2',
  raw: 'diskForm.format.raw',
} as const
const PROFILE_LABELS = {
  label: 'vmDisks.addModal.diskProfile',
  loading: 'vmDisks.addModal.diskProfile.loading',
  defaultOption: 'vmDisks.addModal.diskProfile.default',
  help: 'vmDisks.addModal.diskProfile.help',
  selectDomain: 'vmDisks.addModal.diskProfile.helpNoDomain',
} as const

describe('DiskTypeField', () => {
  it('renders the Image | Direct LUN radios under the caller prefix', () => {
    const html = render(<DiskTypeField idPrefix="add-disk" value="image" onChange={noop} />)
    expect(html).toContain('Disk type')
    expect(html).toContain(
      'data-id="add-disk-type-image" data-name="add-disk-type" data-checked="true"',
    )
    expect(html).toContain(
      'data-id="add-disk-type-lun" data-name="add-disk-type" data-checked="false"',
    )
    expect(html).toContain('>Image</label>')
    expect(html).toContain('>Direct LUN</label>')
  })
})

describe('DiskSizeField', () => {
  it('names the input after the prefix and reads a valid size as default', () => {
    const html = render(<DiskSizeField idPrefix="disk" value={10} onChange={noop} />)
    expect(html).toContain('data-field="disk-size" data-required="true"')
    expect(html).toContain('name="disk-size"')
    expect(html).toContain('aria-label="Size in GiB"')
    expect(html).toContain('value="10"')
    expect(html).toContain('data-validated="default"')
    expect(html).toContain('<div data-variant="default">At least 1 GiB</div>')
  })

  it('flags a cleared input and a size under the floor as errors', () => {
    expect(render(<DiskSizeField idPrefix="disk" value="" onChange={noop} />)).toContain(
      'data-validated="error"',
    )
    const html = render(<DiskSizeField idPrefix="disk" value={0} onChange={noop} />)
    expect(html).toContain('data-validated="error"')
    expect(html).toContain('<div data-variant="error">At least 1 GiB</div>')
  })
})

describe('StorageDomainField', () => {
  it('offers the caller-narrowed targets under the prefixed select id', () => {
    const html = render(
      <StorageDomainField
        idPrefix="add-disk"
        domains={domainsSuccess([nfs, iscsi])}
        targets={[nfs, iscsi] as StorageDomain[]}
        value=""
        onChange={noop}
        noneLabelId="vmDisks.addModal.storageDomain.none"
      />,
    )
    expect(html).toContain('id="add-disk-storage-domain" aria-label="Storage domain"')
    expect(html).toContain('>Select a storage domain</option>')
    expect(html).toContain('<option value="sd-01">nfs-data</option>')
    expect(html).toContain('<option value="sd-02">iscsi-data</option>')
  })

  it('phrases the empty-list placeholder with the id each dialog passes', () => {
    const forVmTab = render(
      <StorageDomainField
        idPrefix="add-disk"
        domains={domainsSuccess([])}
        targets={[]}
        value=""
        onChange={noop}
        noneLabelId="vmDisks.addModal.storageDomain.none"
      />,
    )
    expect(forVmTab).toContain('No data storage domains available')
    const forDiskForm = render(
      <StorageDomainField
        idPrefix="disk"
        domains={domainsSuccess([])}
        targets={[]}
        value=""
        onChange={noop}
        noneLabelId="diskForm.storageDomain.none"
      />,
    )
    expect(forDiskForm).toContain('No data storage domain available')
  })

  it('renders the loading and error+retry states of the collection', () => {
    const pending = render(
      <StorageDomainField
        idPrefix="disk"
        domains={domainsQuery({ isPending: true, isSuccess: false })}
        targets={[]}
        value=""
        onChange={noop}
        noneLabelId="diskForm.storageDomain.none"
      />,
    )
    expect(pending).toContain('Loading storage domains')
    expect(pending).not.toContain('<select')

    const failed = render(
      <StorageDomainField
        idPrefix="disk"
        domains={domainsQuery({
          isError: true,
          isSuccess: false,
          error: new Error('engine unreachable'),
        })}
        targets={[]}
        value=""
        onChange={noop}
        noneLabelId="diskForm.storageDomain.none"
      />,
    )
    expect(failed).toContain('Could not load storage domains: engine unreachable')
    expect(failed).toContain('Retry')
  })
})

describe('DiskProfileField', () => {
  it('waits for a storage domain: disabled select, default option, select-domain helper', () => {
    state.profiles = []
    const html = render(
      <DiskProfileField
        idPrefix="add-disk"
        labelIds={PROFILE_LABELS}
        storageDomainId={undefined}
        value=""
        onChange={noop}
      />,
    )
    expect(html).toContain('id="add-disk-profile" aria-label="Disk profile"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('<option value="">Default profile</option>')
    expect(html).toContain('Select a storage domain to choose a profile.')
  })

  it('lists the picked domain profiles and defaults to the caller value', () => {
    state.profiles = [{ id: 'dp-01', name: 'gold' }, { id: 'dp-02' }]
    const html = render(
      <DiskProfileField
        idPrefix="disk"
        labelIds={PROFILE_LABELS}
        storageDomainId="sd-01"
        value="dp-01"
        onChange={noop}
      />,
    )
    expect(html).toContain('id="disk-profile"')
    expect(html).toContain('data-value="dp-01"')
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('<option value="dp-01">gold</option>')
    // a nameless profile falls back to its id
    expect(html).toContain('<option value="dp-02">dp-02</option>')
    expect(html).toContain('Leave on Default profile to use the storage domain default.')
  })

  it('shows the loading skeleton only while a domain is picked', () => {
    state.profilesPending = true
    const html = render(
      <DiskProfileField
        idPrefix="disk"
        labelIds={PROFILE_LABELS}
        storageDomainId="sd-01"
        value=""
        onChange={noop}
      />,
    )
    state.profilesPending = false
    expect(html).toContain('Loading disk profiles')
    expect(html).not.toContain('<select')
  })
})

describe('AllocationField', () => {
  const field = (domain: unknown, allocation: 'thin' | 'preallocated', touched: boolean) => {
    const resolved = resolveAllocation({
      domain: domain as StorageDomain | undefined,
      allocation,
      touched,
    })
    return render(
      <AllocationField
        idPrefix="disk"
        labelIds={ALLOCATION_LABELS}
        resolved={resolved}
        touched={touched}
        onChange={noop}
      />,
    )
  }

  it('starts Thin, unlocked, naming the derived qcow2 format', () => {
    const html = field(undefined, 'thin', false)
    expect(html).toContain('Allocation policy')
    expect(html).toContain(
      'data-id="disk-allocation-thin" data-name="disk-allocation" data-checked="true"',
    )
    expect(html).toContain(
      'data-id="disk-allocation-preallocated" data-name="disk-allocation" data-checked="false"',
    )
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('Format: QCOW2 (thin)')
  })

  it('defaults an untouched block SD to Preallocated and says why, still changeable', () => {
    const html = field(iscsi, 'thin', false)
    expect(html).toContain(
      'data-id="disk-allocation-preallocated" data-name="disk-allocation" data-checked="true"',
    )
    expect(html).not.toContain('disabled=""')
    expect(html).toContain(
      'Block storage domains default to preallocated — switch to thin if you prefer.',
    )
  })

  it('keeps an explicit Thin pick on a block SD and names its format', () => {
    const html = field(iscsi, 'thin', true)
    expect(html).toContain(
      'data-id="disk-allocation-thin" data-name="disk-allocation" data-checked="true"',
    )
    expect(html).toContain('Format: QCOW2 (thin)')
    expect(html).not.toContain('switch to thin if you prefer')
  })

  it('locks both radios on managed block storage', () => {
    const html = field(cinder, 'thin', true)
    expect(html).toContain(
      'data-id="disk-allocation-preallocated" data-name="disk-allocation" data-checked="true"',
    )
    // both radios disabled
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain('Managed block storage domains require preallocated disks.')
  })

  it('names the raw format for an explicit Preallocated pick', () => {
    expect(field(nfs, 'preallocated', true)).toContain('Format: Raw (preallocated)')
  })
})

describe('DiskSwitchField', () => {
  it('renders one labelled switch in its own group under the given id', () => {
    const html = render(
      <DiskSwitchField id="add-disk-bootable" label="Bootable" isChecked onChange={noop} />,
    )
    expect(html).toContain('data-field="add-disk-bootable"')
    expect(html).toContain('data-id="add-disk-bootable" data-checked="true"')
    expect(html).toContain('Bootable')
    expect(
      render(<DiskSwitchField id="disk-wipe" label="Wipe" isChecked={false} onChange={noop} />),
    ).toContain('data-id="disk-wipe" data-checked="false"')
  })
})
