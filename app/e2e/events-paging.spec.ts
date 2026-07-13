import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Server-side audit-log pagination, end-to-end against the mock engine. The
// mock ships 152 events (15 handcrafted + 137 generated backlog) so 50-row
// windows walk full/full/full/short — the short page is what disables "next"
// (the engine reports no total; the page derives it indeterminately). Range
// assertions target the per-page menu toggle: PF also renders the range in a
// visually-hidden total-items div, which getByText would hit first.
test('events page walks server-side windows via the next button', async ({ page }) => {
  await login(page, { path: '/events' })
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible()

  // page 1: newest handcrafted fixture leads; range shows 1 - 50
  await expect(page.getByText('User admin@internal logged out.')).toBeVisible()
  await expect(page.getByRole('button', { name: '1 - 50' })).toBeVisible()

  const next = page.getByRole('button', { name: 'Go to next page' }).first()
  await expect(next).toBeEnabled()

  // page 2: backlog rows replace the curated hour; range advances
  await next.click()
  await expect(page.getByRole('button', { name: '51 - 100' })).toBeVisible()
  await expect(page.getByText('Audit backlog entry').first()).toBeVisible()
  await expect(page.getByText('User admin@internal logged out.')).toHaveCount(0)

  // walk to the short final window (152 rows -> 50/50/50/2): next disables
  await next.click()
  await expect(page.getByRole('button', { name: '101 - 150' })).toBeVisible()
  await next.click()
  await expect(page.getByRole('button', { name: '151 - 152' })).toBeVisible()
  await expect(next).toBeDisabled()

  // previous still works from the tail
  await page.getByRole('button', { name: 'Go to previous page' }).first().click()
  await expect(page.getByRole('button', { name: '101 - 150' })).toBeVisible()

  // a committed search resets to window 1 and composes with paging
  await page.getByLabel('Search events').fill('severity=alert')
  await page.getByLabel('Search events').press('Enter')
  await expect(page.getByText('Fence operation initiated', { exact: false })).toBeVisible()
})
