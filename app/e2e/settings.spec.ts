import { expect, test, type Locator, type Page } from '@playwright/test'
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

// Roaming: preferences also live in the engine user profile
// (/users/{id}/options, mocked in api/mock/routes/user-options.ts), so they
// follow the user to a browser whose localStorage has never seen them. The
// mock engine lives in the page's memory, so the "other browser" here is a
// different identity signed in on the same page: in-app sign-out keeps the
// mock profile store alive across identities.
async function signInAs(page: Page, username: string) {
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('mock-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible()
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}

async function openPreferences(page: Page) {
  const dialog = await openUserMenuItem(page, 'Settings')
  await dialog.getByRole('tab', { name: 'Preferences' }).click()
  return dialog
}

async function closeSettings(dialog: Locator) {
  await dialog.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
}

test('preferences stored in the engine user profile apply in a fresh browser', async ({ page }) => {
  // a fresh context: localStorage is empty, so 60s / SPICE can only come
  // from the seeded engine profile of roaming@internal
  await login(page, { username: 'roaming@internal' })
  const dialog = await openPreferences(page)
  await expect(dialog.getByText('Saved to your oVirt user profile')).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Refresh interval' })).toHaveValue('60000')
  await expect(dialog.getByRole('radio', { name: 'SPICE' })).toBeChecked()
})

test('a preference change roams back through the engine user profile', async ({ page }) => {
  await login(page)
  let dialog = await openPreferences(page)
  await expect(dialog.getByText('Saved to your oVirt user profile')).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Refresh interval' }).selectOption('30000')
  // closing flushes the debounced write (a DELETE + POST); give the two mock
  // round-trips time to land before the sign-out drops the token — there is
  // no UI signal for "written"
  await closeSettings(dialog)
  await page.waitForTimeout(1_500)

  // another identity's profile replaces the in-memory and localStorage copy...
  await signOut(page)
  await signInAs(page, 'roaming@internal')
  dialog = await openPreferences(page)
  await expect(dialog.getByRole('combobox', { name: 'Refresh interval' })).toHaveValue('60000')
  await closeSettings(dialog)

  // ...so signing back in can only show 30s if the engine kept it
  await signOut(page)
  await signInAs(page, 'admin@internal')
  dialog = await openPreferences(page)
  await expect(dialog.getByRole('combobox', { name: 'Refresh interval' })).toHaveValue('30000')
})

test('preferences fall back to this browser when the engine refuses the profile', async ({
  page,
}) => {
  await login(page, { username: 'noprofile@internal' })
  const dialog = await openPreferences(page)
  await expect(dialog.getByText('Saved in this browser only')).toBeVisible()
  await dialog.getByRole('radio', { name: 'SPICE' }).check()
  await closeSettings(dialog)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('console-settings')))
    .toContain('"preferredConsole":"spice"')
})
