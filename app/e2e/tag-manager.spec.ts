import { expect, test, type Locator, type Page } from '@playwright/test'
import { login } from './helpers'

// The manager dialog is labels-only (create / edit / delete label tags);
// folder management lives in the sidebar tree's right-click context menu
// (FolderTreePanel), covered here through the same rename/move dialogs the
// old manager used. Each test gets a fresh page (and therefore pristine
// in-browser mock fixtures): labels pci-dss (red), backup-daily (blue) and
// legacy (grey), folders prod(web, db) + staging.

// Right-click `target` and wait for its context menu, retrying as a unit:
// under parallel load a background poll can re-render PF trees and swallow
// the click (same self-healing retry as context-menu.spec). Re-clicking is
// idempotent — a repeat right-click on the same node just replaces the menu.
async function openContextMenu(page: Page, target: Locator, menuName: string): Promise<Locator> {
  const menu = page.getByRole('menu', { name: menuName })
  await expect(async () => {
    await target.click({ button: 'right' })
    await expect(menu).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
  return menu
}

async function openLabelManager(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Labels', exact: true }).click()
  const manager = page.getByRole('dialog', { name: 'Manage labels' })
  await expect(manager).toBeVisible()
  return manager
}

test('renames a folder from the tree context menu and the sidebar follows', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  const menu = await openContextMenu(
    page,
    tree.getByText('staging', { exact: true }),
    'Actions for staging',
  )
  await menu.getByRole('menuitem', { name: 'Rename…' }).click()

  const rename = page.getByRole('dialog', { name: "Rename folder 'staging'" })
  await rename.getByLabel('New name').fill('qa')
  await rename.getByRole('button', { name: 'Rename', exact: true }).click()

  await expect(page.getByText('Tag qa updated').first()).toBeVisible()
  await expect(tree.getByText('qa', { exact: true })).toBeVisible()
  await expect(tree.getByText('staging', { exact: true })).toHaveCount(0)
})

test('renaming to a taken name surfaces the engine fault and changes nothing', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  const menu = await openContextMenu(
    page,
    tree.getByText('staging', { exact: true }),
    'Actions for staging',
  )
  await menu.getByRole('menuitem', { name: 'Rename…' }).click()

  const rename = page.getByRole('dialog', { name: "Rename folder 'staging'" })
  await rename.getByLabel('New name').fill('prod')
  await rename.getByRole('button', { name: 'Rename', exact: true }).click()

  // The mock mirrors the engine's 409; the toast carries the fault verbatim
  // and the tree keeps both original folders.
  await expect(page.getByText('Tag name prod is already in use').first()).toBeVisible()
  await expect(tree.getByText('staging', { exact: true })).toBeVisible()
  await expect(tree.getByText('prod', { exact: true })).toBeVisible()
})

test('re-parents a folder through the move picker', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  const menu = await openContextMenu(
    page,
    tree.getByText('staging', { exact: true }),
    'Actions for staging',
  )
  await menu.getByRole('menuitem', { name: 'Move…' }).click()

  const picker = page.getByRole('dialog', { name: "Move folder 'staging'" })
  // The picker excludes the folder's own subtree, so 'staging' itself is
  // absent while 'prod' and 'Top level' are offered.
  await expect(picker.getByText('Top level', { exact: true })).toBeVisible()
  await expect(picker.getByText('staging', { exact: true })).toHaveCount(0)
  await picker.getByText('prod', { exact: true }).click()
  await picker.getByRole('button', { name: 'Move', exact: true }).click()

  await expect(page.getByText('Tag staging updated').first()).toBeVisible()

  // staging now sits inside prod: selecting prod includes staging-app. Retry
  // the select+assert as a unit — under parallel load a background VM poll can
  // re-render the PF TreeView and swallow the click, leaving the table
  // unfiltered; re-selecting the same folder is idempotent so a lost click
  // self-heals.
  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  await expect(async () => {
    await tree.getByText('prod', { exact: true }).click()
    await expect(rows).toHaveCount(5, { timeout: 4000 })
  }).toPass({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: 'staging-app', exact: true })).toBeVisible()
})

test('creates a colored label through the manager', async ({ page }) => {
  await login(page, { path: '/vms' })
  const manager = await openLabelManager(page)

  await manager.getByLabel('New label').fill('compliance')
  await manager.getByRole('button', { name: 'Green', exact: true }).click()
  await manager.getByRole('button', { name: 'Create label', exact: true }).click()

  await expect(page.getByText('Tag compliance created').first()).toBeVisible()
  // The new chip renders with the picked palette color (PF green modifier).
  await expect(
    manager.locator('.pf-v6-c-label.pf-m-green').filter({ hasText: 'compliance' }),
  ).toBeVisible()
})

test('edits a label: rename and recolor land through one dialog', async ({ page }) => {
  await login(page, { path: '/vms' })
  const manager = await openLabelManager(page)

  // Seeded red chip before the edit.
  await expect(
    manager.locator('.pf-v6-c-label.pf-m-red').filter({ hasText: 'pci-dss' }),
  ).toBeVisible()

  await manager.getByRole('button', { name: 'Edit label pci-dss' }).click()
  const dialog = page.getByRole('dialog', { name: "Edit label 'pci-dss'" })
  await dialog.getByLabel('New name').fill('pci')
  await dialog.getByRole('button', { name: 'Blue', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('Tag pci updated').first()).toBeVisible()
  // Chip text and color class both follow the edit.
  await expect(manager.locator('.pf-v6-c-label.pf-m-blue').filter({ hasText: 'pci' })).toBeVisible()
  await expect(manager.getByText('pci-dss', { exact: true })).toHaveCount(0)
})

test('deletes a label behind the danger confirm', async ({ page }) => {
  await login(page, { path: '/vms' })
  const manager = await openLabelManager(page)

  await manager.getByRole('button', { name: 'Delete label legacy' }).click()
  const confirm = page.getByRole('dialog', { name: "Delete label 'legacy'?" })
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText('Tag legacy deleted').first()).toBeVisible()
  await expect(manager.getByText('legacy', { exact: true })).toHaveCount(0)
})
