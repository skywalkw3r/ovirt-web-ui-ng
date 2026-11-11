import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Add Permission dialog: one role granted to several principals at once,
// including a directory user that is added to the engine on the way.
test('grants a role to a DB user and a new directory user in one go', async ({ page }) => {
  await login(page, { path: '/vms/vm-01' })
  await page.getByRole('tab', { name: 'Permissions' }).click()
  await page.getByRole('button', { name: 'Add permission' }).click()
  const dialog = page.getByRole('dialog')

  await dialog.getByRole('checkbox', { name: 'Select ci-service@internal' }).check()
  await dialog.getByRole('combobox', { name: 'Search in' }).selectOption('ldap.corp-authz')
  await dialog.getByRole('checkbox', { name: 'Select bnewhire@ldap.corp' }).check()
  await expect(dialog.getByText('2 principals selected')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('UserRole granted to 2 principals')).toBeVisible()
  // the mock inlines the principal's first name on created grants, and the
  // assignee column prefers it
  const table = page.getByRole('grid', { name: 'Permissions' })
  await expect(table.getByRole('gridcell', { name: 'ci-service', exact: true })).toBeVisible()
  await expect(table.getByRole('gridcell', { name: 'Bianca', exact: true })).toBeVisible()
})

test('keeps a failed grant selected for a retry', async ({ page }) => {
  await login(page, { path: '/vms/vm-01' })
  await page.getByRole('tab', { name: 'Permissions' }).click()
  await page.getByRole('button', { name: 'Add permission' }).click()
  const dialog = page.getByRole('dialog')

  // demo already holds UserRole on the VM, so that grant is refused
  await dialog.getByRole('checkbox', { name: 'Select demo@internal' }).check()
  await dialog.getByRole('checkbox', { name: 'Select mchen@ldap.corp' }).check()
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(dialog.getByText('The role could not be granted to 1 principal')).toBeVisible()
  await expect(dialog.getByText(/demo@internal: .*already exists/)).toBeVisible()
  await expect(dialog.getByText('1 principal selected')).toBeVisible()

  await dialog.getByRole('combobox', { name: 'Role to assign' }).selectOption('role-poweruser')
  await dialog.getByRole('button', { name: 'Retry failed' }).click()
  await expect(dialog).toBeHidden()
})
