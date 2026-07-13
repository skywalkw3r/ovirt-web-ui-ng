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
