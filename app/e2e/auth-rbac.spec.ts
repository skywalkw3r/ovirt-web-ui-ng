import { expect, test } from '@playwright/test'
import { login, openUserMenuItem } from './helpers'

test('user tier gets a read-only folder tree: filtering works, management is hidden', async ({
  page,
}) => {
  await login(page, { username: 'demo@internal', path: '/vms' })
  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  await expect(rows.first()).toBeVisible()

  // No label manager, no drag sources for the user tier.
  await expect(page.getByRole('button', { name: 'Labels', exact: true })).toHaveCount(0)
  await expect(page.locator('tr[draggable="true"]')).toHaveCount(0)

  // The row kebab keeps its other items but loses Move to folder….
  await page.getByRole('button', { name: 'Actions for web-01' }).click()
  await expect(page.getByRole('menuitem', { name: 'Clone VM' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Move to folder…' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // The read-only tree still selects and filters. Selecting a folder filters
  // the table client-side; under heavy parallel load a background VM poll can
  // re-render the PF TreeView at the instant of the click and swallow it,
  // leaving the table unfiltered (all rows). Retry the select+assert as a unit
  // — re-selecting the same folder is idempotent (the handler always sets the
  // folder id), so a lost click self-heals rather than flaking.
  const tree = page.getByLabel('Virtual machine folders')
  await expect(async () => {
    await tree.getByText('web', { exact: true }).click()
    await expect(rows).toHaveCount(2, { timeout: 4000 })
  }).toPass({ timeout: 20_000 })
})

// The tier badge lives in the Settings modal's Account section (its default
// tab). Badge color rides on PF Label's pf-m-<color> modifier — the only
// DOM-visible trace of the color prop. Grey is the default and adds no modifier
// at all, so grey is asserted as "badge present, purple absent".
test('plain user sees no admin nav groups and a grey user badge', async ({ page }) => {
  await login(page, { username: 'demo@internal' })

  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('button', { name: 'Compute' })).toBeVisible()
  // Storage and Administration hold only adminOnly entries, so the whole
  // groups disappear for the user tier.
  await expect(nav.getByRole('button', { name: 'Storage' })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Administration' })).toHaveCount(0)

  const dialog = await openUserMenuItem(page, 'Settings')
  await expect(dialog.getByText('demo@internal')).toBeVisible()
  await expect(dialog.getByText('user', { exact: true })).toBeVisible()
  await expect(dialog.locator('.pf-m-purple')).toHaveCount(0)
})

test('admin sees Storage and Administration groups and a purple admin badge', async ({ page }) => {
  await login(page, { username: 'admin@internal' })

  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('button', { name: 'Storage' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Administration' })).toBeVisible()

  const dialog = await openUserMenuItem(page, 'Settings')
  await expect(dialog.locator('.pf-m-purple', { hasText: 'admin' })).toBeVisible()
})

// Sign out is a direct entry in the user menu (no longer buried in a modal);
// clicking it flips auth state and the router guard redirects to /login.
test('signing out from the user menu returns to the login page', async ({ page }) => {
  await login(page)

  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('deep link to /storage bounces to login and lands back on /storage', async ({ page }) => {
  await page.goto('/storage')
  await expect(page).toHaveURL(/\/login/)

  // Sign in on the bounced page itself so the redirect search param (not a
  // fresh navigation) is what carries the session back to /storage.
  await page.getByLabel('Username').fill('admin@internal')
  await page.getByLabel('Password').fill('mock-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/storage$/)
  await expect(page.getByRole('heading', { name: 'Storage domains' })).toBeVisible()
})
