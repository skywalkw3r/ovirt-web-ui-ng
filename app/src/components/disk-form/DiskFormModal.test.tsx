import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IntlProvider } from 'react-intl'
import type { ReactNode } from 'react'
import { enMessages } from '../../i18n/messages/en'

// vitest env is 'node' (no jsdom); PF is stubbed with semantic passthroughs
// (mirrors MoveCopyDiskModal.test.tsx / UploadImageModal.test.tsx). Assertions
// target the modal's *composition* — create vs edit shaping (data-only SD
// filter, allocation radio + block-SD lock, the New title, the Image | Direct
// LUN branch) and the edit prefill/read-only/grow-field set — not PF markup or
// interaction. The mutation hooks are stubbed so submit is not exercised here;
// the resource-layer tests (disks-crud.test.ts / direct-lun.test.ts) cover the
// wire bodies.
vi.mock('@patternfly/react-core', () => ({
  Button: ({
    children,
    isDisabled,
    type,
    variant,
  }: {
    children?: ReactNode
    isDisabled?: boolean
    type?: string
    variant?: string
  }) => (
    <button disabled={isDisabled} data-type={type} data-variant={variant}>
      {children}
    </button>
  ),
  // Passthroughs SanStorageSection (rendered by the Direct LUN branch) needs.
  Checkbox: ({ label, id }: { label?: ReactNode; id?: string }) => (
    <label data-id={id}>
      <input type="checkbox" readOnly />
      {label}
    </label>
  ),
  EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) => (
    <div>
      <h2>{titleText}</h2>
      {children}
    </div>
  ),
  EmptyStateBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  StackItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Form: ({ children, id }: { children?: ReactNode; id?: string }) => (
    <form id={id}>{children}</form>
  ),
  FormGroup: ({
    label,
    children,
    isRequired,
  }: {
    label?: ReactNode
    children?: ReactNode
    isRequired?: boolean
  }) => (
    <div data-required={isRequired ? 'true' : 'false'}>
      {label !== undefined && <label>{label}</label>}
      {children}
    </div>
  ),
  FormHelperText: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  FormSelect: ({
    children,
    value,
    'aria-label': ariaLabel,
    isDisabled,
  }: {
    children?: ReactNode
    value?: string
    'aria-label'?: string
    isDisabled?: boolean
  }) => (
    <select aria-label={ariaLabel} data-value={String(value)} disabled={isDisabled}>
      {children}
    </select>
  ),
  FormSelectOption: ({ value, label }: { value?: string; label?: string }) => (
    <option value={String(value)}>{label}</option>
  ),
  HelperText: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  HelperTextItem: ({ children, variant }: { children?: ReactNode; variant?: string }) => (
    <div data-variant={variant}>{children}</div>
  ),
  Modal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  ModalHeader: ({ title }: { title?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  // NumberInput: surface value + the input aria-label so the size / extend
  // fields are identifiable and their current value assertable.
  NumberInput: ({
    value,
    inputAriaLabel,
    validated,
  }: {
    value?: number | ''
    inputAriaLabel?: string
    validated?: string
  }) => (
    <input
      type="number"
      aria-label={inputAriaLabel}
      value={String(value)}
      data-validated={validated}
      readOnly
    />
  ),
  // Radio / Switch: render the label + checked + disabled so allocation lock and
  // boolean prefill are assertable.
  Radio: ({
    label,
    isChecked,
    isDisabled,
    id,
  }: {
    label?: ReactNode
    isChecked?: boolean
    isDisabled?: boolean
    id?: string
  }) => (
    <label data-id={id} data-checked={isChecked ? 'true' : 'false'}>
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
  TextInput: ({
    value,
    'aria-label': ariaLabel,
    readOnlyVariant,
    validated,
  }: {
    value?: string
    'aria-label'?: string
    readOnlyVariant?: string
    validated?: string
  }) => (
    <input
      aria-label={ariaLabel}
      value={String(value)}
      data-readonly={readOnlyVariant ?? ''}
      data-validated={validated}
      readOnly
    />
  ),
}))

// SanStorageSection (rendered by the Direct LUN branch) pulls in
// @patternfly/react-table, whose real module drags CSS imports node can't
// parse — stub it with the same semantic passthroughs the cluster-tab tests
// use. The LUN table itself never renders here (no host is ever picked under
// renderToStaticMarkup), so only the shapes matter.
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
}))

const state = vi.hoisted(() => {
  const success = (data: unknown) => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data,
    error: null,
    refetch: () => Promise.resolve(),
  })
  return {
    success,
    domains: success([]) as Record<string, unknown>,
    profiles: [] as unknown[],
    hosts: success([]) as Record<string, unknown>,
  }
})

vi.mock('../../hooks/useStorageDomains', () => ({
  useStorageDomains: () => state.domains,
}))

// The Direct LUN branch's host picker (admin-gated poll hook) — stubbed like
// the SD query so the branch renders without a QueryClient.
vi.mock('../../hooks/useHosts', () => ({
  useHosts: () => state.hosts,
}))

// Only the mutation hooks the modal owns + the profile query need stubbing;
// none are exercised (no interaction under renderToStaticMarkup), so the
// mutation objects are inert and the profile query returns a non-pending list.
vi.mock('../../hooks/useDiskMutations', () => ({
  useCreateDisk: () => ({ mutate: () => {}, isPending: false }),
  useCreateDirectLunDisk: () => ({ mutate: () => {}, isPending: false }),
  useUpdateDisk: () => ({ mutate: () => {}, isPending: false }),
  useStorageDomainDiskProfiles: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data: state.profiles,
    error: null,
  }),
}))

const { DiskFormModal } = await import('./DiskFormModal')

// sd-01/sd-02 are data domains (sd-02 is iscsi/block); sd-iso is an ISO domain
// (never an image-disk target).
const DOMAINS = [
  { id: 'sd-01', name: 'nfs-data', type: 'data', storage: { type: 'nfs' } },
  { id: 'sd-02', name: 'iscsi-data', type: 'data', storage: { type: 'iscsi' } },
  { id: 'sd-iso', name: 'iso', type: 'iso' },
]

// node-01 is up (a valid discovery host); node-02 is in maintenance and must
// be filtered out of the Direct LUN host picker.
const HOSTS = [
  { id: 'host-01', name: 'node-01', status: 'up' },
  { id: 'host-02', name: 'node-02', status: 'maintenance' },
]

// The new disk.lun.* strings resolve through useT, so renders need an
// IntlProvider fed the real en catalog — same pattern as GeneralTab.test.tsx.
function renderCreate(initialDiskType?: 'image' | 'lun') {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <DiskFormModal onClose={() => {}} initialDiskType={initialDiskType} />
    </IntlProvider>,
  )
}

function renderEdit(disk: Record<string, unknown>) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <DiskFormModal disk={disk as any} onClose={() => {}} />
    </IntlProvider>,
  )
}

describe('DiskFormModal — create', () => {
  it('titles New disk and offers only data domains in the SD select', () => {
    state.domains = state.success(DOMAINS)
    const html = renderCreate()

    expect(html).toContain('New disk')
    // both data domains are targets
    expect(html).toContain('<option value="sd-01">nfs-data</option>')
    expect(html).toContain('<option value="sd-02">iscsi-data</option>')
    // the ISO domain is never an image-disk target
    expect(html).not.toContain('<option value="sd-iso">')
    // primary action is Create
    expect(html).toContain('>Create</button>')
  })

  it('shows the allocation radio defaulting to Thin, unlocked with no SD picked', () => {
    state.domains = state.success(DOMAINS)
    const html = renderCreate()

    expect(html).toContain('Thin provision')
    expect(html).toContain('Preallocated')
    // Thin is the default checked radio (no block SD selected yet)
    expect(html).toContain('data-id="disk-allocation-thin" data-checked="true"')
    expect(html).toContain('data-id="disk-allocation-preallocated" data-checked="false"')
    // and the derived format helper reflects thin ⇒ qcow2
    expect(html).toContain('QCOW2 (thin)')
  })

  it('exposes the New-disk boolean switches and omits an Interface field', () => {
    state.domains = state.success(DOMAINS)
    const html = renderCreate()

    expect(html).toContain('Bootable')
    expect(html).toContain('Shareable')
    expect(html).toContain('Wipe after delete')
    // Interface lives on the attachment, not the floating disk — intentionally
    // absent from the create form
    expect(html).not.toContain('Interface')
  })

  it('renders a data-only, empty-domain warning when no data domain exists', () => {
    state.domains = state.success([{ id: 'sd-iso', name: 'iso', type: 'iso' }])
    const html = renderCreate()

    expect(html).toContain('No data storage domain available')
    // no data-domain options
    expect(html).not.toContain('<option value="sd-iso">')
  })

  it('surfaces a storage-domain load error with retry', () => {
    state.domains = {
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: new Error('engine unreachable'),
      refetch: () => Promise.resolve(),
    }
    const html = renderCreate()

    expect(html).toContain('Could not load storage domains:')
    expect(html).toContain('engine unreachable')
    expect(html).toContain('Retry')
  })
})

describe('DiskFormModal — edit', () => {
  const disk = {
    id: 'disk-1',
    alias: 'web-root',
    description: 'the root disk',
    status: 'ok',
    storage_type: 'image',
    provisioned_size: 10 * 1024 ** 3,
    sparse: true,
    shareable: true,
    wipe_after_delete: false,
    storage_domains: { storage_domain: [{ id: 'sd-01', name: 'nfs-data' }] },
    disk_profile: { id: 'dp-01', name: 'gold' },
  }

  it('titles Edit with the alias and prefills alias/description', () => {
    state.domains = state.success(DOMAINS)
    const html = renderEdit(disk)

    // renderToStaticMarkup HTML-escapes the apostrophe
    expect(html).toContain('Edit disk &#x27;web-root&#x27;')
    expect(html).toContain('value="web-root"')
    expect(html).toContain('value="the root disk"')
    // primary action is Save (not Create)
    expect(html).toContain('>Save</button>')
    expect(html).not.toContain('>Create</button>')
  })

  it('shows the current size read-only and a grow-only Extend field starting at 0', () => {
    state.domains = state.success(DOMAINS)
    const html = renderEdit(disk)

    // current size read-only, in GiB
    expect(html).toContain('value="10 GiB"')
    // the grow input, aria-labelled and starting at 0
    expect(html).toContain('aria-label="Extend size by, in GiB"')
    expect(html).toContain('Disks can only be grown')
    // allocation shown read-only (locked in edit) — thin ⇒ "Thin provision"
    expect(html).toContain('value="Thin provision"')
  })

  it('prefills the shareable/wipe switches from the disk', () => {
    state.domains = state.success(DOMAINS)
    const html = renderEdit(disk)

    // shareable was true, wipe was false
    expect(html).toContain('data-id="disk-shareable" data-checked="true"')
    expect(html).toContain('data-id="disk-wipe" data-checked="false"')
  })

  it('defaults the profile select to the disk current profile', () => {
    state.domains = state.success(DOMAINS)
    state.profiles = [{ id: 'dp-01', name: 'gold' }]
    const html = renderEdit(disk)

    // the profile field is present with the disk's current profile as the value
    expect(html).toContain('aria-label="Disk profile"')
    expect(html).toContain('data-value="dp-01"')
    expect(html).toContain('<option value="dp-01">gold</option>')
  })
})

describe('DiskFormModal — create, Direct LUN branch', () => {
  it('offers the Image | Direct LUN radio with Image checked by default', () => {
    state.domains = state.success(DOMAINS)
    state.hosts = state.success(HOSTS)
    const html = renderCreate()

    expect(html).toContain('Disk type')
    expect(html).toContain('data-id="disk-type-image" data-checked="true"')
    expect(html).toContain('data-id="disk-type-lun" data-checked="false"')
    // the image branch is rendered (SD select present)
    expect(html).toContain('aria-label="Storage domain"')
  })

  it('renders host picker + storage-type toggle and hides every image-only field', () => {
    state.domains = state.success(DOMAINS)
    state.hosts = state.success(HOSTS)
    const html = renderCreate('lun')

    // LUN branch controls
    expect(html).toContain('data-id="disk-type-lun" data-checked="true"')
    expect(html).toContain('aria-label="Host to use"')
    expect(html).toContain('data-id="disk-lun-type-iscsi" data-checked="true"')
    expect(html).toContain('data-id="disk-lun-type-fcp" data-checked="false"')
    // only UP hosts are discovery candidates
    expect(html).toContain('<option value="host-01">node-01</option>')
    expect(html).not.toContain('<option value="host-02">')
    // image-only fields are hidden, not just disabled
    expect(html).not.toContain('aria-label="Size in GiB"')
    expect(html).not.toContain('aria-label="Storage domain"')
    expect(html).not.toContain('Allocation policy')
    expect(html).not.toContain('data-id="disk-bootable"')
    expect(html).not.toContain('aria-label="Disk profile"')
    // the shared fields stay
    expect(html).toContain('aria-label="Disk alias"')
    expect(html).toContain('Shareable')
    expect(html).toContain('Wipe after delete')
  })

  it('gates the LUN picker behind a chosen host and Create behind a selected LUN', () => {
    state.domains = state.success(DOMAINS)
    state.hosts = state.success(HOSTS)
    const html = renderCreate('lun')

    // no host picked yet — SanStorageSection shows its pick-a-host helper
    expect(html).toContain('Select a host to use before choosing LUNs.')
    // no LUN selected — the helper asks for exactly one and Create is disabled
    expect(html).toContain('Select exactly one LUN to back the disk.')
    expect(html).toContain('<button disabled="" data-type="submit" data-variant="primary">Create')
  })

  it('surfaces a host load error with retry inside the LUN branch', () => {
    state.domains = state.success(DOMAINS)
    state.hosts = {
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: new Error('hosts unreachable'),
      refetch: () => Promise.resolve(),
    }
    const html = renderCreate('lun')

    expect(html).toContain('Could not load hosts: hosts unreachable')
    expect(html).toContain('Retry')
  })
})

describe('DiskFormModal — edit, direct-LUN disk', () => {
  const lunDisk = {
    id: 'disk-lun-1',
    alias: 'san-vol',
    status: 'ok',
    storage_type: 'lun',
    provisioned_size: 0,
    shareable: false,
    wipe_after_delete: false,
    lun_storage: {
      type: 'iscsi',
      logical_units: {
        logical_unit: [{ id: '36001405abc', size: 100 * 1024 ** 3 }],
      },
    },
  }

  it('hides extend/allocation/profile, reads size from the LUN and keeps the editable fields', () => {
    state.domains = state.success(DOMAINS)
    state.hosts = state.success(HOSTS)
    const html = renderEdit(lunDisk)

    // size comes from the bound LUN (no provisioned_size on a LUN disk)
    expect(html).toContain('value="100 GiB"')
    // image-only fields are gone
    expect(html).not.toContain('aria-label="Extend size by, in GiB"')
    expect(html).not.toContain('Allocation policy')
    expect(html).not.toContain('aria-label="Disk profile"')
    // the LUN note explains why
    expect(html).toContain('Direct LUN disks have no image')
    // still editable: alias/description/shareable/wipe
    expect(html).toContain('value="san-vol"')
    expect(html).toContain('data-id="disk-shareable"')
    expect(html).toContain('data-id="disk-wipe"')
    expect(html).toContain('>Save</button>')
  })
})
