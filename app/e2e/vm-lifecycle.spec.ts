import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('starts legacy-erp from its row kebab and it reaches running', async ({ page }) => {
  await login(page, { path: '/vms' })

  const row = page
    .locator('tr')
    .filter({ has: page.getByRole('link', { name: 'legacy-erp', exact: true }) })
  // PF stamps dataLabel onto the cell as data-label, so this survives the
  // selection checkbox column shifting the positional indexes.
  const statusCell = row.locator('td[data-label="Status"]')
  await expect(row).toBeVisible()

  // Mock state persists for the dev-server session, so a prior run may have
  // started this VM already — only click Start when it is actually down.
  if ((await statusCell.innerText()).trim() === 'Powered off') {
    await row.getByRole('button', { name: 'Actions for legacy-erp' }).click()
    await page.getByRole('menuitem', { name: 'Start' }).click()
    await expect(page.getByText('Start requested for legacy-erp').first()).toBeVisible()
  }

  // powering_up settles to up after ~4s in the mock and the list polls every
  // 10s, so the final status can take two poll cycles to show. 'up' renders
  // as 'Running' (statusLabel display name, capitalized by statusText).
  await expect(statusCell).toHaveText('Running', { timeout: 30_000 })
})
