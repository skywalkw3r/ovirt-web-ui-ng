import { expect, test } from '@playwright/test'
import { login, openUserMenuItem } from './helpers'

// Preferences write through to localStorage ('console-settings'), so a value
// picked in the modal must survive a full page reload — the reload drops the
// in-memory session token and bounces to /login, which is exactly the
// roaming-lite behavior the SettingsProvider contract promises.
test('refresh interval picked in Preferences persists across reload and re-login', async ({
  page,
}) => {
  await login(page)

  let dialog = await openUserMenuItem(page, 'Settings')
  await dialog.getByRole('tab', { name: 'Preferences' }).click()
  const interval = dialog.getByRole('combobox', { name: 'Refresh interval' })
  // 10s is the documented default; move it to 30s.
  await expect(interval).toHaveValue('10000')
  await interval.selectOption('30000')
  // Write-through: no save button, closing is enough.
  await dialog.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()

  // The token is memory-only, so reloading lands on /login with the
  // localStorage settings intact.
  await page.reload()
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Username').fill('admin@internal')
  await page.getByLabel('Password').fill('mock-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible()

  // Each Playwright test gets a fresh browser context (empty localStorage),
  // so this cannot be a leftover from another test — it is the reload
  // surviving the write.
  dialog = await openUserMenuItem(page, 'Settings')
  await dialog.getByRole('tab', { name: 'Preferences' }).click()
  await expect(dialog.getByRole('combobox', { name: 'Refresh interval' })).toHaveValue('30000')
})

test('preferred console choice persists across reload and re-login', async ({ page }) => {
  await login(page)

  let dialog = await openUserMenuItem(page, 'Settings')
  await dialog.getByRole('tab', { name: 'Preferences' }).click()
  await expect(dialog.getByRole('radio', { name: 'VNC' })).toBeChecked()
  await dialog.getByRole('radio', { name: 'SPICE' }).check()
  await dialog.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()

  await page.reload()
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Username').fill('admin@internal')
  await page.getByLabel('Password').fill('mock-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible()

  dialog = await openUserMenuItem(page, 'Settings')
  await dialog.getByRole('tab', { name: 'Preferences' }).click()
  await expect(dialog.getByRole('radio', { name: 'SPICE' })).toBeChecked()
})
