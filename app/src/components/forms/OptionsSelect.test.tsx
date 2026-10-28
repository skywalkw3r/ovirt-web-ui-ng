import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { enMessages } from '../../i18n/messages/en'

// The vitest env is 'node' (no jsdom) and PF react-core's node entry requires
// raw .css files node can't parse, so — like StatusBadge.test.tsx — the PF
// pieces are stubbed with semantic passthroughs that echo the props the
// primitive is contracted to forward (isDisabled, validated, variant, option
// value/label). The assertions target that wiring, not PF internals.
vi.mock('@patternfly/react-core', () => ({
  FormSelect: ({
    id,
    isDisabled,
    validated,
    value,
    children,
  }: {
    id: string
    isDisabled?: boolean
    validated?: string
    value: string
    children?: ReactNode
  }) => (
    <select id={id} disabled={isDisabled} data-validated={validated} defaultValue={value}>
      {children}
    </select>
  ),
  FormSelectOption: ({
    value,
    label,
    isDisabled,
  }: {
    value: string
    label: string
    isDisabled?: boolean
  }) => (
    <option value={value} disabled={isDisabled}>
      {label}
    </option>
  ),
  FormHelperText: ({ children }: { children?: ReactNode }) => (
    <div className="form-helper">{children}</div>
  ),
  HelperText: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  HelperTextItem: ({ variant, children }: { variant?: string; children?: ReactNode }) => (
    <div data-variant={variant ?? 'default'}>{children}</div>
  ),
  Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}))

const { OptionsHelper, OptionsSelect } = await import('./OptionsSelect')
const { optionsStatus } = await import('./optionsStatus')

interface Row {
  id: string
  name: string
}

// Hand-built query stubs — the primitive reads the structural OptionsQuery
// slice, so no QueryClient is needed.
const pending = { data: undefined, isPending: true, isError: false, error: null, refetch: vi.fn() }
const failed = {
  data: undefined,
  isPending: false,
  isError: true,
  error: new Error('HTTP 500'),
  refetch: vi.fn(),
}
const loaded = (rows: Row[]) => ({
  data: rows,
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
})

// useT resolves through react-intl, so renders need an IntlProvider; the real
// en catalog keeps the English assertions meaningful.
function render(ui: ReactNode) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      {ui}
    </IntlProvider>,
  )
}

function renderSelect(query: Parameters<typeof optionsStatus<Row>>[0]) {
  return render(
    <OptionsSelect
      id="pick"
      ariaLabel="Pick one"
      value=""
      onChange={() => {}}
      query={query}
      placeholder={{ label: 'Select a row', isDisabled: true }}
    >
      {(rows) => rows.map((row) => <option key={row.id} value={row.id} label={row.name} />)}
    </OptionsSelect>,
  )
}

describe('optionsStatus', () => {
  it('maps the query lifecycle onto the four option-list states', () => {
    expect(optionsStatus(pending)).toBe('loading')
    expect(optionsStatus(failed)).toBe('error')
    expect(optionsStatus(loaded([]))).toBe('empty')
    expect(optionsStatus(loaded([{ id: 'a', name: 'A' }]))).toBe('ready')
  })

  it('lets a failed read win over stale data so it never passes for empty', () => {
    expect(optionsStatus({ ...failed, data: [] })).toBe('error')
    expect(optionsStatus({ ...failed, data: [{ id: 'a', name: 'A' }] })).toBe('error')
  })
})

describe('OptionsSelect', () => {
  it('renders the select disabled with a loading hint while the read is pending', () => {
    const html = renderSelect(pending)

    expect(html).toContain('<select id="pick" disabled=""')
    expect(html).toContain('data-validated="default"')
    // the placeholder is the only option — no rows are invented while loading
    expect(html).toContain('Select a row')
    expect(html).not.toContain('<option value="a"')
    expect(html).toContain('data-variant="indeterminate"')
    expect(html).toContain('Loading')
  })

  it('honours a caller-supplied loading label', () => {
    const html = render(
      <OptionsSelect
        id="pick"
        ariaLabel="Pick one"
        value=""
        onChange={() => {}}
        query={pending}
        loadingLabel="Loading scheduling policies"
      >
        {() => null}
      </OptionsSelect>,
    )

    expect(html).toContain('Loading scheduling policies')
  })

  it('surfaces a failed read as an error line with the fault detail and a Retry', () => {
    const html = renderSelect(failed)

    expect(html).toContain('<select id="pick" disabled=""')
    expect(html).toContain('data-validated="error"')
    expect(html).toContain('data-variant="error"')
    expect(html).toContain('Something went wrong: HTTP 500')
    expect(html).toMatch(/<button type="button">Retry<\/button>/)
    // the option renderer is never invoked for a failed read
    expect(html).not.toContain('<option value="a"')
  })

  it('renders the caller options and no helper once the read has rows', () => {
    const html = renderSelect(
      loaded([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ]),
    )

    // enabled: the select carries no disabled attribute (the mock emits id,
    // disabled, data-validated in that order)
    expect(html).toContain('<select id="pick" data-validated="default"')
    expect(html).toContain('<option value="a" label="Alpha">')
    expect(html).toContain('<option value="b" label="Beta">')
    expect(html).not.toContain('form-helper')
  })

  it('tells a genuinely empty catalog apart from a failed read', () => {
    const html = renderSelect(loaded([]))

    // the select stays enabled (only the placeholder option is disabled)
    expect(html).toContain('<select id="pick" data-validated="default"')
    expect(html).toContain('Select a row')
    expect(html).toContain('data-variant="default"')
    expect(html).toContain('Nothing here yet')
    expect(html).not.toContain('Retry')
  })
})

describe('OptionsHelper', () => {
  it('renders nothing for a loaded list and the error line for a failed one', () => {
    expect(render(<OptionsHelper query={loaded([{ id: 'a', name: 'A' }])} />)).toBe('')

    const html = render(<OptionsHelper query={failed} />)
    expect(html).toContain('data-variant="error"')
    expect(html).toContain('Retry')
  })

  it('prefixes the line with the field label when the select lives elsewhere', () => {
    expect(render(<OptionsHelper query={pending} label="Cluster" />)).toContain('Cluster: Loading')
    expect(render(<OptionsHelper query={failed} label="Cluster" />)).toContain(
      'Cluster: Something went wrong: HTTP 500',
    )
  })
})
