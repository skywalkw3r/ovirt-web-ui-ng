import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import type { UseQueryResult } from '@tanstack/react-query'
import { en as enMessages } from '../../i18n/messages/en'

// Node test env + PF CSS imports → stub PF with semantic passthroughs (the
// GeneralTab.test.tsx pattern). Assertions target the panel's composition:
// capability gating of the add/remove affordances, the assignee-type hints,
// and the four states — not PF markup.
vi.mock('@patternfly/react-core', () => ({
  Button: ({
    children,
    isDisabled,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode
    isDisabled?: boolean
    'aria-label'?: string
  }) => (
    <button disabled={isDisabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  EmptyState: ({ titleText, children }: { titleText?: ReactNode; children?: ReactNode }) => (
    <div>
      <h4>{titleText}</h4>
      {children}
    </div>
  ),
  EmptyStateBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Label: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  // ConfirmModal (via RemovePermissionConfirm) pulls these in at import time
  Modal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  ModalHeader: ({ title }: { title?: ReactNode }) => <h1>{title}</h1>,
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  ToggleGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToggleGroupItem: ({
    text,
    isSelected,
    onChange,
  }: {
    text?: ReactNode
    isSelected?: boolean
    onChange?: () => void
  }) => (
    <button aria-pressed={isSelected} onClick={onChange}>
      {text}
    </button>
  ),
  Toolbar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ToolbarItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
  ActionsColumn: ({ items }: { items: { title?: string; isDanger?: boolean }[] }) => (
    <button aria-label={`Row actions: ${items.map((item) => item.title).join(',')}`}>⋮</button>
  ),
}))

const state = vi.hoisted(() => ({
  caps: { tier: 'admin', isAdmin: true, loaded: true },
}))

vi.mock('../../auth/capabilities', () => ({
  useCapabilities: () => state.caps,
}))

vi.mock('../../hooks/usePermissionMutations', () => ({
  useAddPermission: () => ({ isPending: false, mutate: () => {} }),
  useRemovePermission: () => ({ isPending: false, mutate: () => {} }),
  // assignee-name join sources (live engines serialize nameless principals)
  usePermissionUsers: () => ({ data: [{ id: 'user-01', user_name: 'admin@internal' }] }),
  useGroups: () => ({ data: [{ id: 'group-01', name: 'lab-operators' }] }),
}))

// keep the modal's own dependency tree (picker queries, SearchInput) out of
// this suite — AddPermissionModal.test.tsx covers it
vi.mock('./AddPermissionModal', () => ({
  AddPermissionModal: () => null,
}))

const { PermissionsPanel, isDirectPermission } = await import('./PermissionsPanel')
type PermissionRow = import('./PermissionsPanel').PermissionRow

function asQuery(data: PermissionRow[]): UseQueryResult<PermissionRow[], Error> {
  return {
    isPending: false,
    isError: false,
    isSuccess: true,
    data,
    error: null,
    refetch: () => Promise.resolve(),
  } as unknown as UseQueryResult<PermissionRow[], Error>
}

// The live schemas are looseObjects: principals ride through as extra
// properties PermissionRow deliberately does not model — hence the assertion
// instead of an annotation.
const ROWS = [
  {
    id: 'perm-1',
    role: { id: 'role-superuser', name: 'SuperUser', administrative: true },
    user: { name: 'admin@internal' },
  },
  {
    id: 'perm-2',
    role: { id: 'role-user', name: 'UserRole', administrative: false },
    group: { name: 'dev-team' },
  },
  // merged row without an id (or principal) — must render, but not offer Remove
  { role: { name: 'GhostRole' } },
] as PermissionRow[]

function render(rows: PermissionRow[]) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <PermissionsPanel
        entityKind="cluster"
        entityId="cluster-1"
        entityNoun="cluster"
        permissions={asQuery(rows)}
      />
    </IntlProvider>,
  )
}

describe('PermissionsPanel', () => {
  it('gives admins the add surface and a per-row actions kebab with Remove', () => {
    state.caps = { tier: 'admin', isAdmin: true, loaded: true }
    const html = render(ROWS)

    expect(html).toContain('Add permission')
    // rows with ids get the kebab whose single item is Remove
    expect(html.match(/aria-label="Row actions: Remove"/g)).toHaveLength(2)
    // the id-less row renders read-only
    expect(html).toContain('GhostRole')
  })

  it('marks assignee type (user vs group) and role type (administrative vs user)', () => {
    state.caps = { tier: 'admin', isAdmin: true, loaded: true }
    const html = render(ROWS)

    expect(html).toContain('admin@internal')
    expect(html).toContain('dev-team')
    expect(html).toMatch(/admin@internal[^]*?<span>User<\/span>/)
    expect(html).toMatch(/dev-team[^]*?<span>Group<\/span>/)
    expect(html).toContain('Administrative')
    // principal unknown → em-dash assignee
    expect(html).toContain('—')
  })

  it('hides the mutation affordances from non-admin sessions (VM tab posture)', () => {
    state.caps = { tier: 'user', isAdmin: false, loaded: true }
    const html = render(ROWS)

    expect(html).not.toContain('Add permission')
    expect(html).not.toContain('Row actions:')
    // the read-only table still renders
    expect(html).toContain('SuperUser')
    expect(html).toContain('dev-team')
  })

  it('renders the entity-noun empty state', () => {
    state.caps = { tier: 'admin', isAdmin: true, loaded: true }
    const html = render([])

    expect(html).toContain('No permissions')
    expect(html).toContain('No roles are assigned on this cluster.')
    // Add stays available so an empty list is a starting point, not a dead end
    expect(html).toContain('Add permission')
  })
})

describe('isDirectPermission', () => {
  it('is direct when the id is NOT in the ancestor-scope set', () => {
    const inherited = new Set(['sys-1', 'cluster-1'])
    expect(isDirectPermission({ id: 'direct-1' }, inherited)).toBe(true)
    expect(isDirectPermission({ id: 'direct-2' }, new Set())).toBe(true)
  })

  it('is inherited when the id also appears in a parent scope', () => {
    // the same grant surfaced on the VM list and on the system/cluster list
    const inherited = new Set(['sys-1', 'cluster-1'])
    expect(isDirectPermission({ id: 'sys-1' }, inherited)).toBe(false)
    expect(isDirectPermission({ id: 'cluster-1' }, inherited)).toBe(false)
  })

  it('treats an id-less row as direct (nothing to match against)', () => {
    expect(isDirectPermission({}, new Set(['sys-1']))).toBe(true)
  })
})
