import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('folder selection filters the VM list and All virtual machines resets it', async ({
  page,
}) => {
  await login(page, { path: '/vms' })

  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  const tree = page.getByLabel('Virtual machine folders')
  await expect(rows.first()).toBeVisible()

  // 'web' folder: exactly the two web-tagged fixtures. Other tests only add
  // untagged VMs, so folder counts stay stable across a shared session.
  await tree.getByText('web', { exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'web-01', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'web-02', exact: true })).toBeVisible()

  // 'prod' includes its subfolders (web + db).
  await tree.getByText('prod', { exact: true }).click()
  await expect(rows).toHaveCount(4)

  // Root selection clears the filter: untagged VMs like legacy-erp reappear
  // and the list is back to at least the nine fixtures (no test removes VMs).
  await tree.getByText('All virtual machines', { exact: true }).click()
  await expect(page.getByRole('link', { name: 'legacy-erp', exact: true })).toBeVisible()
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(9)
})

test('folder selection rides the URL: deep link, breadcrumb, back/forward', async ({ page }) => {
  // Deep link straight into the web folder — Protected's login redirect
  // carries path + search, so the scope survives the sign-in round-trip.
  await login(page, { path: '/vms?folder=tag-web' })
  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  await expect(rows).toHaveCount(2)

  // Breadcrumb spells out the ancestor chain of the selected folder.
  const breadcrumb = page.getByLabel('Folder path')
  await expect(breadcrumb).toContainText('All virtual machines')
  await expect(breadcrumb).toContainText('prod')
  await expect(breadcrumb).toContainText('web')

  // Selecting another folder pushes a history entry and rewrites the URL…
  const tree = page.getByLabel('Virtual machine folders')
  await tree.getByText('staging', { exact: true }).click()
  await expect(page).toHaveURL(/folder=tag-staging/)

  // …so back returns to the previous folder scope, filter and all.
  await page.goBack()
  await expect(page).toHaveURL(/folder=tag-web/)
  await expect(rows).toHaveCount(2)

  // A breadcrumb ancestor re-scopes (prod = 4 fixture VMs), and the root
  // crumb clears the param entirely.
  await breadcrumb.getByRole('button', { name: 'prod' }).click()
  await expect(rows).toHaveCount(4)
  await page.getByLabel('Folder path').getByRole('button', { name: 'All virtual machines' }).click()
  await expect(page).not.toHaveURL(/folder=/)
})

test('folder tree badges show subtree VM counts', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  await expect(tree.getByText('prod', { exact: true })).toBeVisible()

  // prod's badge counts its whole subtree: web (2) + db (2).
  const prodItem = tree.getByRole('treeitem', { name: /prod/ }).first()
  await expect(prodItem.locator('.pf-v6-c-badge').first()).toHaveText('4')
  const webItem = tree.getByRole('treeitem', { name: /web/ }).first()
  await expect(webItem.locator('.pf-v6-c-badge').first()).toHaveText('2')
})

// Right-click works on the WHOLE node row, not just the name text: the count
// badge is the farthest-from-the-text element that still belongs to the row.
test('right-clicking a folder row (its badge) opens the folder menu', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  const prodBadge = tree
    .getByRole('treeitem', { name: /prod/ })
    .first()
    .locator('.pf-v6-c-badge')
    .first()
  const menu = page.getByRole('menu', { name: 'Actions for prod' })
  // a background poll can re-render the tree under the click — retry as a
  // unit; a repeat right-click just replaces the menu
  await expect(async () => {
    await prodBadge.click({ button: 'right' })
    await expect(menu).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
  await expect(menu.getByRole('menuitem', { name: 'New folder…' })).toBeVisible()
})
