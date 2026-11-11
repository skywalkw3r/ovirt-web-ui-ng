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

// folder: and tag: filter-bar tokens (lib/filter-tokens): lifted out of the
// search client-side and matched over the tags the list rows embed, so they
// compose with the engine DSL that remains. Fixture tree: prod(web, db) +
// staging; web-01/web-02 sit in web, db-01 (pci-dss) and db-02 in db.
test('folder: and tag: tokens narrow the VM list and compose with the search DSL', async ({
  page,
}) => {
  await login(page, { path: '/vms' })
  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  const search = page.getByLabel('Search virtual machines')
  const link = (name: string) => page.getByRole('link', { name, exact: true })
  await expect(rows.first()).toBeVisible()

  // an anchored path selects exactly that folder
  await search.fill('folder:/prod/web')
  await expect(rows).toHaveCount(2)
  await expect(link('web-01')).toBeVisible()
  await expect(link('web-02')).toBeVisible()
  // the token rides the URL like any other query, so it is linkable and
  // saved with a bookmark
  await expect(page).toHaveURL(/q=folder/)

  // a folder token covers its subfolders, like selecting it in the tree
  await search.fill('folder:prod')
  await expect(rows).toHaveCount(4)

  // tokens AND together…
  await search.fill('folder:prod tag:pci-dss')
  await expect(rows).toHaveCount(1)
  await expect(link('db-01')).toBeVisible()

  // …and with the engine DSL left over once they are lifted out (db-02 is
  // migrating, so status=up keeps three of prod's four)
  await search.fill('folder:prod and status=up')
  await expect(rows).toHaveCount(3)
  await expect(link('db-02')).toHaveCount(0)

  // a token naming nothing reads as "no results", not as "no filter"
  await search.fill('tag:no-such-tag')
  await expect(page.getByText('No virtual machines match the search')).toBeVisible()
})

test('folder: and tag: tokens filter the Templates list', async ({ page }) => {
  await login(page, { path: '/templates' })
  const templateRows = page.locator('table[aria-label="Templates"] tbody tr')
  const search = page.getByLabel('Search templates')
  await expect(templateRows.first()).toBeVisible()

  // the Templates bar commits on Enter; win2022-base is the legacy-labelled one
  await search.fill('tag:legacy')
  await search.press('Enter')
  await expect(templateRows).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'win2022-base', exact: true })).toBeVisible()

  await search.fill('folder:/prod')
  await search.press('Enter')
  await expect(templateRows).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'centos-stream-9', exact: true })).toBeVisible()
})

// Combined view: the same tokens ahead of its client-side name needle.
// staging holds one VM and one template; the needle keeps the template.
test('folder: token composes with the name filter on VMs & Templates', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const combinedRows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  const filter = page.getByLabel('Filter VMs and templates by name')
  await expect(combinedRows.first()).toBeVisible()
  await filter.fill('folder:/staging')
  await expect(combinedRows).toHaveCount(2)
  await filter.fill('folder:/staging win')
  await expect(combinedRows).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'win2022-base', exact: true })).toBeVisible()
})
