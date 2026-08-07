import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Webadmin-parity list filters: the disk grid's Disk type toggle + Content
// type dropdown, and the Roles page's System/Custom toggle + name search.

test('disk grid filters by disk type and content type', async ({ page }) => {
  await login(page, { path: '/disks' })
  const rows = page.locator('table tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(3)
  const all = await rows.count()

  // fixtures carry at least one direct-LUN disk; the toggle narrows to it
  await page.getByRole('button', { name: 'Direct LUN' }).click()
  await expect.poll(() => rows.count()).toBeLessThan(all)
  const luns = await rows.count()
  expect(luns).toBeGreaterThanOrEqual(1)

  // back to All, then narrow by ISO content instead
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect.poll(() => rows.count()).toBe(all)
  await page.getByLabel('Content type').selectOption('iso')
  await expect.poll(() => rows.count()).toBeLessThan(all)
})

test('roles page narrows by name search and role-type toggle', async ({ page }) => {
  await login(page, { path: '/roles' })
  const rows = page.locator('table tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(3)
  const all = await rows.count()

  // exact-cell match: the substring would also hit PowerUserRole
  const userRoleRow = rows.filter({
    has: page.getByRole('gridcell', { name: 'UserRole', exact: true }),
  })

  // name search narrows the list and keeps the match
  await page.getByLabel('Filter roles by name').fill('UserRole')
  await expect.poll(() => rows.count()).toBeLessThan(all)
  await expect(userRoleRow).toHaveCount(1)

  // UserRole is engine-shipped: System keeps it, Custom filters it out
  // (PowerUserRole — a custom fixture whose name contains the needle — is
  // exactly what the Custom toggle should still show)
  await page.getByRole('button', { name: 'System' }).click()
  await expect(userRoleRow).toHaveCount(1)
  await page.getByRole('button', { name: 'Custom' }).click()
  await expect(userRoleRow).toHaveCount(0)
  await expect(rows.filter({ hasText: 'PowerUserRole' })).toHaveCount(1)
})
