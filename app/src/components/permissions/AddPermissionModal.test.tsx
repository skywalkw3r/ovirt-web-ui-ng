// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockRequest } from '../../api/mock/handlers'
import { EVERYONE_GROUP_ID } from '../../api/resources/permissions'
import { QUOTA_CONSUMER_ROLE_ID, USER_ROLE_ID } from '../../api/resources/roles'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { AddPermissionModal } from './AddPermissionModal'

// The Add Permission dialog against the in-memory mock engine: multi-select
// grants, partial failure + retry, Everyone, My groups and the directory
// search (materialize-then-grant). vm-01 starts with the shared VM fixture
// grants: SuperUser → admin (user-01) and UserRole → demo (user-02).

interface PermissionRow {
  role?: { id?: string; name?: string }
  user?: { id?: string }
  group?: { id?: string }
}

async function vmPermissions(): Promise<PermissionRow[]> {
  const data = (await mockRequest('/vms/vm-01/permissions')) as { permission?: PermissionRow[] }
  return data.permission ?? []
}

async function renderModal() {
  const onClose = vi.fn()
  renderWithProviders(
    <AddPermissionModal
      entityKind="vm"
      entityId="vm-01"
      entityNoun="virtual machine"
      onClose={onClose}
    />,
  )
  // roles and the DB user list both loaded
  await screen.findByRole(
    'checkbox',
    { name: 'Select demo@internal' },
    { timeout: FIND_TIMEOUT_MS },
  )
  await screen.findByRole('combobox', { name: 'Role to assign' }, { timeout: FIND_TIMEOUT_MS })
  return onClose
}

const addButton = () => screen.getByRole('button', { name: 'Add' })

describe('AddPermissionModal', () => {
  it('defaults the role to UserRole and leaves QuotaConsumer out (webadmin populateRoles)', async () => {
    await renderModal()
    const role = screen.getByRole('combobox', { name: 'Role to assign' }) as HTMLSelectElement
    expect(role.value).toBe(USER_ROLE_ID)
    const values = [...role.options].map((option) => option.value)
    expect(values).not.toContain(QUOTA_CONSUMER_ROLE_ID)
    expect(role.querySelector('optgroup[label="Administrative roles"]')).not.toBeNull()
    expect(role.querySelector('optgroup[label="User roles"]')).not.toBeNull()
    // nothing picked yet
    expect(screen.getByText('Select one or more users to grant the role to.')).toBeDefined()
    expect(addButton()).toHaveProperty('disabled', true)
  })

  it('grants one role to several principals with one POST each, then closes', async () => {
    const user = userEvent.setup()
    const onClose = await renderModal()
    await user.click(screen.getByRole('checkbox', { name: 'Select ci-service@internal' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select mchen@ldap.corp' }))
    // a group picked after switching kind joins the same batch
    await user.click(screen.getByRole('radio', { name: 'Group' }))
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select qa' }, { timeout: FIND_TIMEOUT_MS }),
    )
    expect(screen.getByText('3 principals selected')).toBeDefined()

    await user.click(addButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })

    const rows = await vmPermissions()
    const userRole = rows.filter((row) => row.role?.id === USER_ROLE_ID)
    expect(userRole.map((row) => row.user?.id ?? row.group?.id).sort()).toEqual(
      ['group-03', 'user-02', 'user-03', 'user-05'].sort(),
    )
  })

  it('keeps the failed principals selected and retries just those', async () => {
    const user = userEvent.setup()
    const onClose = await renderModal()
    // demo already holds UserRole on every VM → that grant is refused
    await user.click(screen.getByRole('checkbox', { name: 'Select demo@internal' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select ci-service@internal' }))
    await user.click(addButton())

    const alert = await screen.findByText(
      'The role could not be granted to 1 principal',
      {},
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(onClose).not.toHaveBeenCalled()
    const failure = within(alert.closest('.pf-v6-c-alert') as HTMLElement)
    expect(failure.getByText(/demo@internal: .*Permission already exists/)).toBeDefined()
    // ci-service went through; only demo is still selected
    expect(
      (await vmPermissions()).some(
        (row) => row.user?.id === 'user-03' && row.role?.id === USER_ROLE_ID,
      ),
    ).toBe(true)
    expect(screen.getByText('1 principal selected')).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'Select ci-service@internal' })).toHaveProperty(
      'checked',
      false,
    )

    // a different role makes the retry succeed
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Role to assign' }),
      'role-poweruser',
    )
    await user.click(screen.getByRole('button', { name: 'Retry failed' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(
      (await vmPermissions()).some(
        (row) => row.user?.id === 'user-02' && row.role?.id === 'role-poweruser',
      ),
    ).toBe(true)
  })

  it('grants to the built-in Everyone group', async () => {
    const user = userEvent.setup()
    const onClose = await renderModal()
    await user.click(screen.getByRole('radio', { name: 'Everyone' }))
    expect(
      screen.getByText(/built-in Everyone group, so every user gets it on this virtual machine/),
    ).toBeDefined()
    await user.click(addButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(
      (await vmPermissions()).some(
        (row) => row.group?.id === EVERYONE_GROUP_ID && row.role?.id === USER_ROLE_ID,
      ),
    ).toBe(true)
  })

  it("grants to the signed-in user's groups, adding a directory group to the engine first", async () => {
    const user = userEvent.setup()
    const onClose = await renderModal()
    await user.click(screen.getByRole('radio', { name: 'My groups' }))
    const table = await screen.findByRole(
      'grid',
      { name: 'My groups' },
      { timeout: FIND_TIMEOUT_MS },
    )
    // select-all over the two memberships
    await user.click(within(table).getByRole('checkbox', { name: 'Select all rows' }))
    await user.click(addButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })

    // platform-team was not in the engine DB: POST /groups materialized it
    const groups = ((await mockRequest('/groups')) as { group?: { id: string; name?: string }[] })
      .group
    const platform = groups?.find((group) => group.name === 'platform-team')
    expect(platform).toBeDefined()
    const granted = (await vmPermissions())
      .filter((row) => row.role?.id === USER_ROLE_ID)
      .map((row) => row.group?.id)
    // dev-team resolved to its existing DB row, platform-team to the new one
    expect(granted).toContain('group-01')
    expect(granted).toContain(platform?.id)
  })

  it('searches a directory and adds a principal that is not in the engine yet', async () => {
    const user = userEvent.setup()
    const onClose = await renderModal()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Search in' }), 'ldap.corp-authz')
    expect(screen.getByText(/not in the engine yet are added to it/)).toBeDefined()
    await user.click(
      await screen.findByRole(
        'checkbox',
        { name: 'Select bnewhire@ldap.corp' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    // jdoe is already a DB user: matched, not re-added
    await user.click(screen.getByRole('checkbox', { name: 'Select jdoe@ldap.corp' }))
    await user.click(addButton())
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })

    const users = ((await mockRequest('/users')) as { user?: { id: string; user_name?: string }[] })
      .user
    const created = users?.find((row) => row.user_name === 'bnewhire@ldap.corp')
    expect(created?.id).toMatch(/^user-new-/)
    const granted = (await vmPermissions())
      .filter((row) => row.role?.id === USER_ROLE_ID)
      .map((row) => row.user?.id)
    expect(granted).toContain(created?.id)
    expect(granted).toContain('user-04')
  })
})
