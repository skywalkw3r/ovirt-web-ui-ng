import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IntlProvider } from 'react-intl'
import type { ReactNode } from 'react'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import { enMessages } from '../../i18n/messages/en'

// The Direct LUN branch AddDiskModal and DiskFormModal share. Same node-env
// PF stubs as DiskFormModal.test.tsx (SanStorageSection needs the react-table
// passthroughs too, though no LUN table renders while no host is picked).
vi.mock('@patternfly/react-core', () => ({
  Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
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
    fieldId,
  }: {
    label?: ReactNode
    children?: ReactNode
    fieldId?: string
  }) => (
    <div data-field={fieldId}>
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
  }: {
    children?: ReactNode
    value?: string
    id?: string
    'aria-label'?: string
  }) => (
    <select id={id} aria-label={ariaLabel} data-value={String(value)}>
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
  Radio: ({
    label,
    isChecked,
    id,
    name,
  }: {
    label?: ReactNode
    isChecked?: boolean
    id?: string
    name?: string
  }) => (
    <label data-id={id} data-name={name} data-checked={isChecked ? 'true' : 'false'}>
      <input type="radio" checked={Boolean(isChecked)} readOnly />
      {label}
    </label>
  ),
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  TextInput: ({ value, 'aria-label': ariaLabel }: { value?: string; 'aria-label'?: string }) => (
    <input aria-label={ariaLabel} value={String(value)} readOnly />
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
  Th: ({ children, screenReaderText }: { children?: ReactNode; screenReaderText?: string }) => (
    <th>{children ?? screenReaderText}</th>
  ),
  Td: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
}))

const { DirectLunFields } = await import('./DirectLunFields')

type HostsQuery = Parameters<typeof DirectLunFields>[0]['hosts']

// a plain object stands in for the TanStack result; the branch reads only
// these flags
const hostsQuery = (overrides: Record<string, unknown>): HostsQuery =>
  ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data: [],
    error: null,
    refetch: () => Promise.resolve(),
    ...overrides,
  }) as unknown as HostsQuery
const hostsSuccess = (data: unknown[]) => hostsQuery({ data })

// node-01 is up (a valid discovery host); node-02 is in maintenance and must
// be filtered out of the host picker.
const HOSTS = [
  { id: 'host-01', name: 'node-01', status: 'up' },
  { id: 'host-02', name: 'node-02', status: 'maintenance' },
]

const noop = () => {}

function render(
  overrides: Partial<Parameters<typeof DirectLunFields>[0]> & { idPrefix: string },
): string {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <DirectLunFields
        hosts={hostsSuccess(HOSTS)}
        hostId=""
        onHostChange={noop}
        storageType="iscsi"
        onStorageTypeChange={noop}
        selectedLunIds={[]}
        onSelectedLunIdsChange={noop}
        selectedLuns={[]}
        onSelectedLunsChange={noop}
        {...overrides}
      />
    </IntlProvider>,
  )
}

describe('DirectLunFields', () => {
  it('offers only UP hosts, under the caller-prefixed ids', () => {
    const html = render({ idPrefix: 'add-disk' })
    expect(html).toContain('data-field="add-disk-lun-host"')
    expect(html).toContain('id="add-disk-lun-host" aria-label="Host to use"')
    expect(html).toContain('>Select a host</option>')
    expect(html).toContain('<option value="host-01">node-01</option>')
    expect(html).not.toContain('<option value="host-02">')
    expect(html).toContain('Any up host — it is only used to discover and read the LUNs.')
  })

  it('says so when no host is up', () => {
    const html = render({
      idPrefix: 'disk',
      hosts: hostsSuccess([{ id: 'host-02', name: 'node-02', status: 'maintenance' }]),
    })
    expect(html).toContain('>No up host available</option>')
  })

  it('renders the fabric radios and titles the SAN section by fabric kind', () => {
    const iscsi = render({ idPrefix: 'disk' })
    expect(iscsi).toContain(
      'data-id="disk-lun-type-iscsi" data-name="disk-lun-storage-type" data-checked="true"',
    )
    expect(iscsi).toContain(
      'data-id="disk-lun-type-fcp" data-name="disk-lun-storage-type" data-checked="false"',
    )
    expect(iscsi).toContain('data-field="disk-lun-san"')
    expect(iscsi).toContain('iSCSI targets')

    const fcp = render({ idPrefix: 'add-disk', storageType: 'fcp' })
    expect(fcp).toContain(
      'data-id="add-disk-lun-type-fcp" data-name="add-disk-lun-storage-type" data-checked="true"',
    )
    expect(fcp).toContain('Fibre Channel LUNs')
  })

  it('asks for exactly one LUN until one is picked, then names it', () => {
    const none = render({ idPrefix: 'disk' })
    // no host picked yet — SanStorageSection shows its pick-a-host helper
    expect(none).toContain('Select a host to use before choosing LUNs.')
    expect(none).toContain('Select exactly one LUN to back the disk.')

    const picked = render({
      idPrefix: 'disk',
      hostId: 'host-01',
      selectedLunIds: ['36001405abc'],
      selectedLuns: [{ id: '36001405abc', size: 100 * 1024 ** 3 } as DiscoveredLun],
    })
    expect(picked).toContain('Selected LUN: 36001405abc (100 GiB)')
    expect(picked).not.toContain('Select exactly one LUN to back the disk.')
  })

  it('renders the host collection loading and error+retry states', () => {
    expect(
      render({
        idPrefix: 'disk',
        hosts: hostsQuery({ isPending: true, isSuccess: false }),
      }),
    ).toContain('Loading hosts')

    const failed = render({
      idPrefix: 'disk',
      hosts: hostsQuery({
        isError: true,
        isSuccess: false,
        error: new Error('hosts unreachable'),
      }),
    })
    expect(failed).toContain('Could not load hosts: hosts unreachable')
    expect(failed).toContain('Retry')
  })
})
