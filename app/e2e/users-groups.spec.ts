import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Users and Groups share one page shell with a tab per collection; each tab
// keeps its own route so deep links and Back/Forward work.

test('one Users & Groups surface: tabs switch routes, both tables render', async ({ page }) => {
  await login(page, { path: '/users' })

  // the shared shell with the Users tab active
  await expect(page.getByRole('heading', { level: 1, name: 'Users & Groups' })).toBeVisible()
  const usersTab = page.getByRole('tab', { name: 'Users' })
  await expect(usersTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('table[aria-label="Users"] tbody tr').first()).toBeVisible()

  // switching tabs navigates — /groups is a real route
  await page.getByRole('tab', { name: 'Groups' }).click()
  await expect(page).toHaveURL(/\/groups$/)
  await expect(page.locator('table[aria-label="Directory groups"] tbody tr').first()).toBeVisible()

  // Back returns to the Users tab (each tab is its own history entry)
  await page.goBack()
  await expect(page).toHaveURL(/\/users$/)
  await expect(usersTab).toHaveAttribute('aria-selected', 'true')

  // the sidebar carries ONE combined entry, not two separate links
  await expect(page.getByRole('link', { name: 'Users & Groups' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Groups', exact: true })).toHaveCount(0)
})
