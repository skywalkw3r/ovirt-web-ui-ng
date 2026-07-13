import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

// vitest env is 'node' (no jsdom); PF is stubbed with semantic passthroughs
// (mirrors AddPermissionModal.test.tsx). Assertions target the modal's
// composition — the live-proxy caveat alert, the data-only target filter, and
// which footer/progress pieces each upload-machine step renders — not PF markup
// or interaction. The file picker cannot be driven under renderToStaticMarkup,
// so the file-derived helper text (detected format) is not asserted here; the
// stubbed upload-machine step drives every other visible branch.
vi.mock('@patternfly/react-core', () => ({
  Alert: ({
    children,
    title,
    variant,
  }: {
    children?: ReactNode
    title?: ReactNode
    variant?: string
  }) => (
    <div role="alert" data-variant={variant}>
      <strong>{title}</strong>
      {children}
    </div>
  ),
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
  Content: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  Form: ({ children, id }: { children?: ReactNode; id?: string }) => (
    <form id={id}>{children}</form>
  ),
  FormGroup: ({ label, children }: { label?: ReactNode; children?: ReactNode }) => (
    <div>
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
  HelperTextItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Modal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  ModalHeader: ({ title }: { title?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
    </header>
  ),
  Progress: ({ title, value, variant }: { title?: string; value?: number; variant?: string }) => (
    <div role="progressbar" data-value={value} data-variant={variant}>
      {title}
    </div>
  ),
  ProgressMeasureLocation: { outside: 'outside' },
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  TextInput: ({
    value,
    'aria-label': ariaLabel,
    isDisabled,
  }: {
    value?: string
    'aria-label'?: string
    isDisabled?: boolean
  }) => <input aria-label={ariaLabel} value={String(value)} disabled={isDisabled} readOnly />,
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
    upload: { step: 'idle' } as { step: string; progress?: number; error?: string },
  }
})

vi.mock('../../hooks/useStorageDomains', () => ({
  useStorageDomains: () => state.domains,
}))

vi.mock('../../hooks/useDiskMutations', () => ({
  useUploadDisk: () => ({
    state: state.upload,
    start: () => Promise.resolve(),
    cancel: () => {},
    reset: () => {},
  }),
}))

const { UploadImageModal } = await import('./UploadImageModal')

const DOMAINS = [
  { id: 'sd-01', name: 'data', type: 'data' },
  { id: 'sd-iso', name: 'iso', type: 'iso' },
]

function render() {
  return renderToStaticMarkup(<UploadImageModal onClose={() => {}} />)
}

describe('UploadImageModal', () => {
  it('shows the live-proxy caveat and offers only data domains as targets', () => {
    state.domains = state.success(DOMAINS)
    state.upload = { step: 'idle' }
    const html = render()

    expect(html).toContain('Live upload needs the imageio proxy reachable and trusted')
    expect(html).toContain('<option value="sd-01">data</option>')
    // ISO domains can't hold the floating upload target
    expect(html).not.toContain('<option value="sd-iso">')
    // idle → Upload primary button present, disabled until a file/domain/alias set
    expect(html).toContain('>Upload</button>')
  })

  it('renders progress and a Cancel-upload button while transferring', () => {
    state.domains = state.success(DOMAINS)
    state.upload = { step: 'transferring', progress: 0.5 }
    const html = render()

    expect(html).toContain('role="progressbar"')
    expect(html).toContain('Uploading image data')
    // pending → Cancel upload offered, primary Upload gone
    expect(html).toContain('Cancel upload')
    expect(html).not.toContain('>Upload</button>')
    // 15 + 0.5*70 = 50
    expect(html).toContain('data-value="50"')
  })

  it('surfaces the fault on a failed upload and offers Try again', () => {
    state.domains = state.success(DOMAINS)
    state.upload = { step: 'failed', error: 'network error (CORS or cert trust?)' }
    const html = render()

    expect(html).toContain('Upload failed')
    expect(html).toContain('network error (CORS or cert trust?)')
    expect(html).toContain('Try again')
    // danger-variant progress bar
    expect(html).toContain('data-variant="danger"')
    // terminal → footer offers Close
    expect(html).toContain('>Close</button>')
  })

  it('notes the partial disk was removed on cancel', () => {
    state.domains = state.success(DOMAINS)
    state.upload = { step: 'cancelled' }
    const html = render()

    expect(html).toContain('The transfer was cancelled and the partial disk removed.')
    expect(html).toContain('Try again')
  })

  it('marks the progress bar success on completion', () => {
    state.domains = state.success(DOMAINS)
    state.upload = { step: 'succeeded' }
    const html = render()

    expect(html).toContain('Upload complete')
    expect(html).toContain('data-variant="success"')
    expect(html).toContain('data-value="100"')
    // success is terminal but shows no Try again
    expect(html).not.toContain('Try again')
    expect(html).toContain('>Close</button>')
  })
})
