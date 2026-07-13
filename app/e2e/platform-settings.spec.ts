import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Platform settings live in the reserved 'ui.platform' tag cluster served by
// the mock /tags handlers, so saves persist for the lifetime of one page load
// (module state) — every scenario below therefore stays inside a single load
// and uses logout → login (not reload) to cross sessions.

// A tiny valid SVG for the upload path.
const LOGO_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#3aa655"/></svg>',
)

async function openPlatformSettings(page: Page): Promise<void> {
  const nav = page.getByRole('navigation')
  const link = nav.getByRole('link', { name: 'Platform Settings' })
  // the Administration group stays expanded across navigations — only toggle
  // it when the entry is not already visible
  if (!(await link.isVisible())) {
    await nav.getByRole('button', { name: 'Administration' }).click()
  }
  await link.click()
  // exact — the save toast's own heading ("Success alert: Platform settings
  // saved") would otherwise substring-match on revisits
  await expect(page.getByRole('heading', { name: 'Platform settings', exact: true })).toBeVisible()
}

// datetime-local value (minute precision) offset from now, in local time —
// the same wall-clock form the schedule inputs expect.
function localInput(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

test('announcement banner: publish, dismiss for the session, return at next sign-in', async ({
  page,
}) => {
  await login(page)
  await openPlatformSettings(page)

  // Publish a warning announcement.
  // PF renders the switch input under its toggle span (the whole control is
  // a <label>), so pointer actionability needs force; check() still verifies.
  await page.getByRole('switch', { name: 'Show announcement banner' }).check({ force: true })
  await page.getByRole('radio', { name: 'Warning' }).check()
  await page.getByLabel('Banner title').fill('Planned maintenance')
  await page.getByLabel('Message', { exact: true }).fill('Engine down Saturday 22:00–23:00 UTC.')
  // The form previews the banner before anything is saved (nothing else on
  // the page renders the alert heading yet — the real banner needs a save).
  await expect(page.getByRole('heading', { name: 'Planned maintenance' })).toBeVisible()
  const saveButton = page.getByRole('button', { name: 'Save', exact: true })
  await expect(saveButton).toBeEnabled()
  await saveButton.click()
  await expect(page.getByText('Platform settings saved')).toBeVisible()

  // The banner shows on every page of the console…
  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).click()
  const banner = page.getByRole('heading', { name: 'Planned maintenance' })
  await expect(banner).toBeVisible()

  // …until dismissed, which silences it for the rest of THIS session…
  await page.getByRole('button', { name: 'Dismiss announcement' }).click()
  await expect(banner).toBeHidden()
  await page.getByRole('navigation').getByRole('link', { name: 'Events' }).click()
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
  await expect(banner).toBeHidden()

  // …and returns at the next sign-in (login() clears the dismissal).
  await page.getByRole('button', { name: 'User menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByLabel('Username').fill('admin@internal')
  await page.getByLabel('Password').fill('mock-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Planned maintenance' })).toBeVisible()
})

test('custom logo upload rebrands the masthead; restore returns the default', async ({ page }) => {
  await login(page)
  await openPlatformSettings(page)

  // The shipped logo is Vite-inlined as a URL-encoded data URI (comma after
  // the mime); uploads are FileReader base64 (';base64,') — that's the tell.
  const masthead = page.locator('.pf-v6-c-masthead')
  await expect(masthead.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/)

  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'brand.svg', mimeType: 'image/svg+xml', buffer: LOGO_SVG })
  // Preview swaps to the uploaded image immediately; save publishes it.
  await expect(page.getByAltText('Logo preview')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml;base64,/,
  )
  await page.getByRole('textbox', { name: 'Product name' }).fill('Acme Cloud')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Platform settings saved')).toBeVisible()

  // Masthead brand + tab title follow the saved settings.
  await expect(masthead.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/)
  await expect(masthead.getByAltText('Acme Cloud')).toBeVisible()
  await expect(page).toHaveTitle('Acme Cloud')

  // Restore stock branding.
  await page.getByRole('button', { name: 'Restore default logo' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(masthead.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/)
})

test('support link appears in the user menu once configured', async ({ page }) => {
  await login(page)
  await openPlatformSettings(page)

  // Absent while unset.
  await page.getByRole('button', { name: 'User menu' }).click()
  await expect(page.getByRole('menuitem', { name: 'Get support' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page
    .getByRole('textbox', { name: 'Support link' })
    .fill('https://helpdesk.example.com/tickets')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Platform settings saved')).toBeVisible()

  await page.getByRole('button', { name: 'User menu' }).click()
  const support = page.getByRole('menuitem', { name: 'Get support' })
  await expect(support).toBeVisible()
  await expect(support).toHaveAttribute('href', 'https://helpdesk.example.com/tickets')
})

test('invalid support URLs and oversized logos are rejected client-side', async ({ page }) => {
  await login(page)
  await openPlatformSettings(page)

  await page.getByRole('textbox', { name: 'Support link' }).fill('javascript:alert(1)')
  await expect(page.getByText('Enter a full URL starting with http:// or https://')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

  // A window that ends before it starts refuses to save.
  await page.getByLabel('Show from', { exact: true }).fill(localInput(60))
  await page.getByLabel('Show until', { exact: true }).fill(localInput(30))
  await expect(page.getByText('“Show until” must be later than “Show from”')).toBeVisible()

  // > 64 KB file bounces with the size message and leaves the form unsaved.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(65 * 1024, 1),
  })
  await expect(page.getByText('The image must be 64 KB or smaller')).toBeVisible()
})

test('scheduled announcement arms by its window and expires past it', async ({ page }) => {
  await login(page)
  await openPlatformSettings(page)

  await page.getByRole('switch', { name: 'Show announcement banner' }).check({ force: true })
  await page.getByLabel('Message', { exact: true }).fill('Scheduled maintenance window')

  // Future start → the form says when it goes live, and no banner shows.
  await page.getByLabel('Show from', { exact: true }).fill(localInput(60))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Platform settings saved')).toBeVisible()
  await expect(page.getByText(/The announcement goes live/)).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance window' })).toBeHidden()

  // Open window (start past, end future) → live everywhere.
  await openPlatformSettings(page)
  await page.getByLabel('Show from', { exact: true }).fill(localInput(-60))
  await page.getByLabel('Show until', { exact: true }).fill(localInput(60))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('The announcement is visible now')).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance window' })).toBeVisible()

  // Closed window (end in the past) → expired, banner gone.
  await openPlatformSettings(page)
  await page.getByLabel('Show until', { exact: true }).fill(localInput(-30))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/The announcement expired/)).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance window' })).toBeHidden()
})

test('user tier: no nav entry, and the page deep-link is locked', async ({ page }) => {
  await login(page, { username: 'user@internal', path: '/platform-settings' })
  // Deep link renders the lock, not the form.
  await expect(
    page.getByRole('heading', { name: 'You do not have permission to view platform settings' }),
  ).toBeVisible()
  // And Administration (the group that would hold the entry) is absent.
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Administration' }),
  ).toHaveCount(0)
})
