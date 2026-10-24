import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IntlProvider } from 'react-intl'
import type { ReactNode } from 'react'
import { enMessages } from '../../i18n/messages/en'

// vitest env is 'node' (no jsdom) and PF react-core's CJS entry requires raw
// .css node can't parse, so the PF pieces are stubbed with semantic
// passthroughs (mirrors AddPermissionModal.test.tsx). Assertions target the
// modal's composition — the target-domain shaping (data-only, current excluded)
// and the copy-only alias field — not PF markup or interaction.
vi.mock('@patternfly/react-core', () => ({
  Button: ({
    children,
    isDisabled,
    type,
  }: {
    children?: ReactNode
    isDisabled?: boolean
    type?: string
  }) => (
    <button disabled={isDisabled} data-type={type}>
      {children}
    </button>
  ),
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
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  TextInput: ({ value, 'aria-label': ariaLabel }: { value?: string; 'aria-label'?: string }) => (
    <input aria-label={ariaLabel} value={String(value)} readOnly />
  ),
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
  return { success, domains: success([]) as Record<string, unknown> }
})

vi.mock('../../hooks/useStorageDomains', () => ({
  useStorageDomains: () => state.domains,
}))

const { MoveCopyDiskModal } = await import('./MoveCopyDiskModal')

// sd-01/sd-02 are data domains; sd-iso is an ISO domain (never a target).
const DOMAINS = [
  { id: 'sd-01', name: 'data', type: 'data' },
  { id: 'sd-02', name: 'hosted_storage', type: 'data' },
  { id: 'sd-iso', name: 'iso', type: 'iso' },
]

const diskOnSd01 = {
  id: 'disk-1',
  alias: 'web-root',
  status: 'ok',
  storage_type: 'image',
  storage_domains: { storage_domain: [{ id: 'sd-01', name: 'data' }] },
}

function render(mode: 'move' | 'copy', disk: Record<string, unknown>) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <MoveCopyDiskModal
        mode={mode}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        disk={disk as any}
        onSubmit={() => {}}
        onClose={() => {}}
      />
    </IntlProvider>,
  )
}

describe('MoveCopyDiskModal', () => {
  it('offers only data domains and excludes the disk current domain', () => {
    state.domains = state.success(DOMAINS)
    const html = render('move', diskOnSd01)

    // the other data domain is a valid target
    expect(html).toContain('<option value="sd-02">hosted_storage</option>')
    // the disk's current domain (sd-01) is excluded
    expect(html).not.toContain('<option value="sd-01">')
    // the ISO domain is never a target
    expect(html).not.toContain('<option value="sd-iso">')
    // move header (renderToStaticMarkup HTML-escapes the apostrophe)
    expect(html).toContain('Move disk &#x27;web-root&#x27;')
  })

  it('hides the alias field on move and shows a defaulted one on copy', () => {
    state.domains = state.success(DOMAINS)

    const moveHtml = render('move', diskOnSd01)
    expect(moveHtml).not.toContain('New disk alias')

    const copyHtml = render('copy', diskOnSd01)
    expect(copyHtml).toContain('aria-label="New disk alias"')
    // copy seeds "<source>-copy"
    expect(copyHtml).toContain('value="web-root-copy"')
    expect(copyHtml).toContain('Copy disk &#x27;web-root&#x27;')
  })

  it('warns and empties the select when no other data domain exists', () => {
    // only the disk's own domain is a data domain → no eligible target
    state.domains = state.success([{ id: 'sd-01', name: 'data', type: 'data' }])
    const html = render('move', diskOnSd01)

    expect(html).toContain('No eligible storage domain')
    expect(html).toContain('No other data storage domain is available')
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
    const html = render('copy', diskOnSd01)

    expect(html).toContain('Could not load storage domains:')
    expect(html).toContain('engine unreachable')
    expect(html).toContain('Retry')
  })
})
