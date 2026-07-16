import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { DiskAttachmentSchema } from '../../api/schemas/disk'
import { enMessages } from '../../i18n/messages/en'

// vitest env is 'node' (no jsdom); PF's CJS entry drags raw .css imports node
// can't parse, so react-core / react-icons / react-table are stubbed with
// semantic passthroughs (same shape DiskFormModal.test.tsx uses). The mutation
// hooks the tab calls at top level are stubbed inert (no QueryClient here); the
// disk list rides in through the mocked useVmDisks. Assertions target the base
// table the tab always renders — the Read-only / Shareable check-or-dash cells
// and the Sparsify kebab item's gating — not PF markup or interaction. The
// Add-Disk profile field sits behind a button click (not reachable under
// renderToStaticMarkup) and reuses DiskFormModal's profile field, covered by
// DiskFormModal.test.tsx.
vi.mock('@patternfly/react-core', () => {
  const passthrough =
    (tag: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement(tag, undefined, children)
  return {
    Button: ({ children }: { children?: ReactNode }) =>
      createElement('button', undefined, children),
    Toolbar: passthrough('div'),
    ToolbarContent: passthrough('div'),
    ToolbarGroup: passthrough('div'),
    ToolbarItem: passthrough('div'),
    Label: ({ children }: { children?: ReactNode }) => createElement('span', undefined, children),
    EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) =>
      createElement('div', undefined, createElement('h2', undefined, titleText), children),
    EmptyStateBody: passthrough('div'),
    EmptyStateFooter: passthrough('div'),
    EmptyStateActions: passthrough('div'),
    Skeleton: ({ screenreaderText }: { screenreaderText?: string }) =>
      createElement('span', undefined, screenreaderText ?? 'skeleton'),
    MenuToggle: passthrough('button'),
    ToggleGroup: passthrough('div'),
    ToggleGroupItem: ({ text, onChange }: { text?: ReactNode; onChange?: () => void }) =>
      createElement('button', { onClick: onChange }, text),
  }
})

// Status glyph stub — the real component pulls in StatusIcon + PF icons; here
// we only need the status word to assert the cell.
vi.mock('../DiskStatusLabel', () => ({
  DiskStatusLabel: ({ status }: { status?: string }) =>
    createElement('span', undefined, status ?? '—'),
}))

// The check cell icon — a distinctive token so a set cell is unambiguous; the
// dash branch renders a literal em dash. aria-label rides through so the a11y
// wiring is assertable.
vi.mock('@patternfly/react-icons', () => ({
  CheckIcon: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) =>
    createElement('span', { 'data-check': ariaLabel }, 'CHECKMARK'),
  EllipsisVIcon: () => createElement('span', undefined, '⋮'),
}))

// The kebab: ActionsColumn is stubbed to surface each item's title, disabled
// state and (localized) disabled-reason description so the Sparsify gating is
// assertable without opening a real menu.
vi.mock('@patternfly/react-table', () => ({
  Table: ({ children, 'aria-label': ariaLabel }: { children?: ReactNode; 'aria-label'?: string }) =>
    createElement('table', { 'aria-label': ariaLabel }, children),
  Thead: ({ children }: { children?: ReactNode }) => createElement('thead', undefined, children),
  Tbody: ({ children }: { children?: ReactNode }) => createElement('tbody', undefined, children),
  Tr: ({ children }: { children?: ReactNode }) => createElement('tr', undefined, children),
  Th: ({ children, screenReaderText }: { children?: ReactNode; screenReaderText?: string }) =>
    createElement('th', undefined, children ?? screenReaderText),
  Td: ({ children, dataLabel }: { children?: ReactNode; dataLabel?: string }) =>
    createElement('td', { 'data-label': dataLabel }, children),
  ActionsColumn: ({
    items,
  }: {
    items: Array<{
      title?: ReactNode
      isDisabled?: boolean
      isSeparator?: boolean
      description?: ReactNode
    }>
  }) =>
    createElement(
      'ul',
      undefined,
      items
        .filter((item) => !item.isSeparator)
        .map((item, index) =>
          createElement(
            'li',
            {
              key: index,
              'data-disabled': item.isDisabled ? 'true' : 'false',
              'data-description': typeof item.description === 'string' ? item.description : '',
            },
            item.title,
          ),
        ),
    ),
}))

// The column picker is a dropdown (not reachable under renderToStaticMarkup);
// stub it away — useColumnPrefs' all-visible default keeps every cell
// assertable below.
vi.mock('../list-toolbar/ColumnPicker', () => ({ ColumnPicker: () => null }))

// Resizable headers reduce to plain <th> (the VmMembershipTable.test stub) —
// drag interaction isn't reachable under renderToStaticMarkup.
vi.mock('../list-toolbar/ResizableTh', () => ({
  resizableTableProps: () => ({}),
  ResizableTh: ({ children, columnKey }: { children?: ReactNode; columnKey?: string }) =>
    createElement('th', { 'data-resizable': columnKey }, children),
}))

// useColumnPrefs reads localStorage on mount; vitest runs in a node
// environment (vite.config.ts), so stub the minimal surface columnPrefs.ts
// touches, backed by an in-memory map (the bookmarks.test.ts pattern).
let storage: Map<string, string>

beforeEach(() => {
  storage = new Map()
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

const state = vi.hoisted(() => ({
  disks: {
    isPending: false,
    isError: false,
    isSuccess: true,
    data: [] as unknown[],
    error: null,
    refetch: () => Promise.resolve(),
  } as Record<string, unknown>,
}))

vi.mock('../../hooks/useVmStorage', () => ({ useVmDisks: () => state.disks }))

// The tab calls these mutation hooks at top level; stub them inert (no
// QueryClient / no interaction driven under renderToStaticMarkup).
const inertMutation = () => ({ mutate: () => {}, isPending: false })
vi.mock('../../hooks/useVmDiskActions', () => ({
  useCreateVmDisk: inertMutation,
  useCreateVmDirectLunDisk: inertMutation,
  useAttachVmDisk: inertMutation,
  useResizeVmDisk: inertMutation,
  useDetachVmDisk: inertMutation,
  useSetVmDiskActive: inertMutation,
}))
vi.mock('../../hooks/useDiskMutations', () => ({
  useMoveDisk: inertMutation,
  useCopyDisk: inertMutation,
  useSparsifyDisk: inertMutation,
  useStorageDomainDiskProfiles: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data: [],
    error: null,
  }),
}))

const { DisksTab } = await import('./DisksTab')

// The attachment shape flows straight through the mocked useVmDisks, so most
// fixtures write the booleans the schema would have coerced; the string-boolean
// case parses its fixture through DiskAttachmentSchema, where the coercion
// actually lives.
function render(disks: unknown[]): string {
  state.disks = { ...state.disks, isSuccess: true, data: disks }
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <DisksTab vmId="vm-1" />
    </IntlProvider>,
  )
}

describe('DisksTab — Read-only / Shareable columns', () => {
  it('renders a check for a read-only, shareable disk', () => {
    const html = render([
      {
        id: 'att-1',
        read_only: true,
        disk: { id: 'd1', name: 'ro-disk', status: 'ok', shareable: true },
      },
    ])
    expect(html).toContain('data-label="Read-only"><span data-check="Yes">CHECKMARK</span>')
    expect(html).toContain('data-label="Shareable"><span data-check="Yes">CHECKMARK</span>')
  })

  it('renders an em dash when read-only and shareable are unset', () => {
    const html = render([
      {
        id: 'att-2',
        read_only: false,
        disk: { id: 'd2', name: 'rw-disk', status: 'ok', shareable: false },
      },
    ])
    expect(html).toContain('data-label="Read-only">—')
    expect(html).toContain('data-label="Shareable">—')
  })

  it("coerces the live engine's string boolean for read-only through the schema", () => {
    const attachment = DiskAttachmentSchema.parse({
      id: 'att-3',
      read_only: 'true',
      disk: { id: 'd3', name: 'str-disk', status: 'ok' },
    })
    expect(attachment.read_only).toBe(true)
    const html = render([attachment])
    expect(html).toContain('data-label="Read-only"><span data-check="Yes">CHECKMARK</span>')
    // shareable absent ⇒ dash
    expect(html).toContain('data-label="Shareable">—')
  })
})

describe('DisksTab — Sparsify kebab gating', () => {
  it('offers Sparsify enabled for an OK, thin, image disk', () => {
    const html = render([
      {
        id: 'att-1',
        disk: { id: 'd1', name: 'thin', status: 'ok', storage_type: 'image', sparse: true },
      },
    ])
    expect(html).toContain('<li data-disabled="false" data-description="">Sparsify</li>')
  })

  it('disables Sparsify for a preallocated disk with the thin-only reason', () => {
    const html = render([
      {
        id: 'att-1',
        disk: { id: 'd1', name: 'prealloc', status: 'ok', storage_type: 'image', sparse: false },
      },
    ])
    expect(html).toContain(
      '<li data-disabled="true" data-description="Only thin-provisioned disks can be sparsified">Sparsify</li>',
    )
  })

  it('disables Sparsify for a direct-LUN disk with the image-only reason', () => {
    const html = render([
      { id: 'att-1', disk: { id: 'd1', name: 'san', status: 'ok', storage_type: 'lun' } },
    ])
    expect(html).toContain(
      '<li data-disabled="true" data-description="Only image disks can be sparsified">Sparsify</li>',
    )
  })

  it('disables Sparsify for a locked disk', () => {
    const html = render([
      {
        id: 'att-1',
        disk: { id: 'd1', name: 'busy', status: 'locked', storage_type: 'image', sparse: true },
      },
    ])
    expect(html).toContain(
      '<li data-disabled="true" data-description="Disk is locked by another operation">Sparsify</li>',
    )
  })
})
