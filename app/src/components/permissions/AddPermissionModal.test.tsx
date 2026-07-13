import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { en as enMessages } from '../../i18n/messages/en'

// The vitest env is 'node' (no jsdom), and PF react-core's node (CJS) entry
// requires raw .css files node can't parse, so — like GeneralTab.test.tsx —
// the PF pieces are stubbed with semantic passthroughs. The assertions target
// the modal's composition (role catalog shaping, default selection, disabled
// submit, results table), not PF markup or interaction.
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
  Form: ({ children }: { children?: ReactNode }) => <form>{children}</form>,
  FormGroup: ({ label, children }: { label?: ReactNode; children?: ReactNode }) => (
    <div>
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
  FormSelectOptionGroup: ({ label, children }: { label?: string; children?: ReactNode }) => (
    <optgroup label={label}>{children}</optgroup>
  ),
  HelperText: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  HelperTextItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Modal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  ModalHeader: ({ title, description }: { title?: ReactNode; description?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
  Radio: ({
    label,
    isChecked,
    'aria-label': ariaLabel,
  }: {
    label?: ReactNode
    isChecked?: boolean
    'aria-label'?: string
  }) => (
    <span data-checked={isChecked ? 'true' : 'false'} aria-label={ariaLabel}>
      {label}
    </span>
  ),
  // the shared list-toolbar SearchInput wraps these two
  SearchInput: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <input aria-label={ariaLabel} />
  ),
  Skeleton: ({ screenreaderText }: { screenreaderText?: string }) => (
    <span>{screenreaderText ?? 'skeleton'}</span>
  ),
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
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

// Picker-query state the mocked hooks hand back, mutable per test. Only the
// fields the modal reads (four-state flags + data) are modeled.
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
    roles: success([]) as Record<string, unknown>,
    users: success([]) as Record<string, unknown>,
    groups: success([]) as Record<string, unknown>,
  }
})

vi.mock('../../hooks/usePermissionMutations', () => ({
  useRoles: () => state.roles,
  usePermissionUsers: () => state.users,
  useGroups: () => state.groups,
}))

const { AddPermissionModal } = await import('./AddPermissionModal')
const { QUOTA_CONSUMER_ROLE_ID, USER_ROLE_ID } = await import('../../api/resources/roles')

const ROLES = [
  { id: 'role-superuser', name: 'SuperUser', administrative: 'true' },
  { id: QUOTA_CONSUMER_ROLE_ID, name: 'QuotaConsumer', administrative: false },
  { id: USER_ROLE_ID, name: 'UserRole', administrative: false },
  { id: 'role-vm-manager', name: 'UserVmManager', administrative: false },
]

const USERS = [
  { id: 'u-jdoe', user_name: 'jdoe@internal', name: 'Jane', last_name: 'Doe' },
  { id: 'u-mchen', user_name: 'mchen@internal' },
]

const GROUPS = [{ id: 'g-dev', name: 'dev-team', domain: { name: 'internal' } }]

function render() {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={enMessages}>
      <AddPermissionModal entityNoun="cluster" onSubmit={() => {}} onClose={() => {}} />
    </IntlProvider>,
  )
}

describe('AddPermissionModal', () => {
  it('defaults the role select to UserRole and excludes QuotaConsumer (webadmin populateRoles)', () => {
    state.roles = state.success(ROLES)
    state.users = state.success(USERS)
    state.groups = state.success(GROUPS)
    const html = render()

    expect(html).toContain(`data-value="${USER_ROLE_ID}"`)
    expect(html).not.toContain('QuotaConsumer')
    // grouped user vs administrative roles
    expect(html).toContain('<optgroup label="User roles">')
    expect(html).toContain('<optgroup label="Administrative roles">')
    expect(html).toMatch(/<optgroup label="Administrative roles">[^]*?SuperUser[^]*?<\/optgroup>/)
    expect(html).toMatch(/<optgroup label="User roles">[^]*?UserVmManager[^]*?<\/optgroup>/)
  })

  it('renders the user results with per-row select radios and starts with Add disabled', () => {
    state.roles = state.success(ROLES)
    state.users = state.success(USERS)
    state.groups = state.success(GROUPS)
    const html = render()

    // principal picker defaults to users; groups stay unrendered
    expect(html).toContain('jdoe@internal')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('aria-label="Select jdoe@internal"')
    expect(html).toContain('aria-label="Select mchen@internal"')
    expect(html).not.toContain('dev-team')
    // nothing selected yet → inline hint + disabled submit
    expect(html).toContain('Select a user to grant the role to.')
    expect(html).toContain('disabled="">Add')
    // header copy names the entity
    expect(html).toContain('Grant a role on this cluster to a user or group.')
    expect(html).toContain('aria-label="Search users"')
  })

  it('shows the empty state when no users are known and skeletons while roles load', () => {
    state.roles = {
      isPending: true,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
      refetch: () => Promise.resolve(),
    }
    state.users = state.success([])
    state.groups = state.success(GROUPS)
    const html = render()

    expect(html).toContain('No users found')
    expect(html).toContain('No users are known to the engine.')
    expect(html).toContain('Loading roles')
    // no role selected while the catalog loads → Add stays disabled
    expect(html).toContain('disabled="">Add')
  })

  it('surfaces picker query errors with a retry affordance', () => {
    state.roles = state.success(ROLES)
    state.users = {
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      error: new Error('engine unreachable'),
      refetch: () => Promise.resolve(),
    }
    state.groups = state.success(GROUPS)
    const html = render()

    expect(html).toContain('Could not load users:')
    expect(html).toContain('engine unreachable')
    expect(html).toContain('Retry')
  })
})
