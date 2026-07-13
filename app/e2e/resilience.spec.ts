import { expect, test } from '@playwright/test'
import { login, openUserMenuItem } from './helpers'

// An unmatched path renders the NotFoundRoute EmptyState (defaultNotFoundComponent
// on the router) instead of a blank match. The session token is memory-only, so
// navigate client-side after login rather than page.goto — a goto would drop the
// session and bounce to /login before the router could 404.
test('an unknown route shows the not-found page with a way back', async ({ page }) => {
  await login(page)

  await page.evaluate(() => {
    window.history.pushState({}, '', '/does-not-exist')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  // The primary action links home; following it lands on the dashboard.
  await page.getByRole('link', { name: 'Go to dashboard' }).click()
  await expect(page).toHaveURL(/\/$/)
})

// The About dialog opens from the user menu and shows the console version. The
// engine rows come from the shared apiInfo query; the console-version row is
// always present regardless of engine state, so it is the stable assertion.
test('About dialog opens from the user menu and shows a version', async ({ page }) => {
  await login(page)

  const dialog = await openUserMenuItem(page, 'About')
  await expect(dialog.getByText('oVirt Console')).toBeVisible()
  await expect(dialog.getByText('Console version')).toBeVisible()
  // The Console version is the first value in the facts list (the Components
  // section below adds more version rows). Assert the row has a non-empty
  // semver-shaped value next to its term rather than pinning the exact string.
  await expect(dialog.locator('.about-facts dd').first()).toHaveText(/\d+\.\d+\.\d+/)
})

// Pressing '?' anywhere in the shell opens the keyboard-shortcuts dialog
// (self-mounting global listener in ShortcutsHelp); Esc closes it via PF's
// Modal handling.
test('pressing ? opens the shortcuts dialog and Esc closes it', async ({ page }) => {
  await login(page)

  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

// Leader-key navigation (useNavShortcuts, mounted once in AppShell): 'g' then a
// second key jumps. 'g e' lands on Events. The listener lives on window and the
// shell has no field focused after login, so the bare keypresses drive it.
test("'g e' navigates to Events", async ({ page }) => {
  await login(page)
  // login() lands on the dashboard, whose post-auth redirect (LoginPage) commits
  // a moment after sign-in; wait for the dashboard to fully settle so it can't
  // race the keyboard navigation below.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Virtual machines by status')).toBeAttached()

  await page.keyboard.press('g')
  await page.keyboard.press('e')

  await expect(page).toHaveURL(/\/events$/)
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible()
})

// '/' opens the command palette in search mode (dispatches the same event the
// masthead search box uses) — universal, no per-page focus plumbing.
test("pressing '/' opens the command palette", async ({ page }) => {
  await login(page)

  await page.keyboard.press('/')
  await expect(page.getByPlaceholder('Search VMs, hosts, storage…')).toBeVisible()
})

// The whole scheme is gated off while a field owns the keyboard: typing 'g' 'e'
// into the palette's search input fills the box and never navigates.
test('leader sequences do nothing while typing in an input', async ({ page }) => {
  await login(page)

  await page.keyboard.press('/')
  const input = page.getByPlaceholder('Search VMs, hosts, storage…')
  await expect(input).toBeVisible()
  await input.click()
  await page.keyboard.type('ge')

  await expect(input).toHaveValue('ge')
  await expect(page).not.toHaveURL(/\/events$/)
})
