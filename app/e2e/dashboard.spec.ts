import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The Storage domains card is a pressure gauge, not an inventory: of the six
// non-image fixture domains it shows only the four fullest, highest
// utilization first — data 65%, block-data 30%, hosted_storage 26%, iso 18%;
// nfs-data-2 (12%) and export (10%) fall below the cut. The full list stays
// one click away.
test('storage card shows the four fullest domains, highest utilization first', async ({ page }) => {
  await login(page)
  const items = page.getByRole('list', { name: 'Storage domain capacity' }).getByRole('listitem')
  await expect(items).toHaveCount(4)
  await expect(items.nth(0)).toContainText('data')
  await expect(items.nth(1)).toContainText('block-data')
  await expect(items.nth(2)).toContainText('hosted_storage')
  await expect(items.nth(3)).toContainText('iso')
  await expect(page.getByRole('link', { name: 'View storage domains' })).toBeVisible()
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
