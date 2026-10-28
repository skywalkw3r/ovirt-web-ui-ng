import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The Storage capacity tile names its fullest domain (data, 65% in the
// fixture) as the busiest and links straight to it.
test('the storage capacity tile links to the fullest domain', async ({ page }) => {
  await login(page)
  const storage = page.getByRole('region', { name: 'Storage' })
  await expect(storage.getByText(/free$/)).toBeVisible()
  await storage.getByRole('link', { name: 'data' }).click()
  await expect(page).toHaveURL(/\/storage\/[^/]+$/)
})

// The Inventory card's status counts deep-link into the filtered list, so a
// glance at "1 in maintenance" is one click from the host itself. The
// maintenance bucket spans two engine statuses (maintenance +
// preparing_for_maintenance), so the link ORs them — the list must never
// under-count the badge that sent you there.
test('the inventory maintenance count links to the matching hosts', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: /in maintenance/i }).click()

  await expect(page).toHaveURL(/\/hosts\?q=/)
  // the toolbar search box carries the committed engine query, so the filter
  // is visible and editable rather than a hidden mode
  await expect(page.getByLabel('Search hosts')).toHaveValue(
    'status=maintenance or status=preparing_for_maintenance',
  )
  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('node-03')
})
