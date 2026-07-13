import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The combined inventory: VMs and templates as typed rows under the one
// folder tree, with per-kind Move to folder.

test('mixes VMs and templates under the folder tree with combined counts', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  // 9 fixture VMs + 3 fixture templates (a page of generated extras at
  // VITE_MOCK_SCALE — those are untagged, so the folder counts below hold).
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  // Type column distinguishes the kinds (build-runner sorts onto page 1
  // even at VITE_MOCK_SCALE, unlike the web-* fixtures).
  await expect(rows.filter({ hasText: 'centos-stream-9' })).toContainText('Template')
  await expect(rows.filter({ hasText: 'build-runner' })).toContainText('VM')

  // Both kinds carry an at-a-glance glyph in the Type column (VM monitor /
  // template layers) — neither renders text-only.
  await expect(
    rows.filter({ hasText: 'centos-stream-9' }).locator('td[data-label="Type"] svg').first(),
  ).toBeVisible()
  await expect(
    rows.filter({ hasText: 'build-runner' }).locator('td[data-label="Type"] svg').first(),
  ).toBeVisible()

  // The prod folder holds 4 VMs and the centos template (5 rows), and the
  // tree badge agrees.
  const tree = page.getByLabel('VM and template folders')
  await tree.getByText('prod', { exact: true }).click()
  await expect(rows).toHaveCount(5)
  await expect(page.getByRole('link', { name: 'centos-stream-9' })).toBeVisible()

  const prodItem = tree.getByRole('treeitem', { name: /prod/ }).first()
  await expect(prodItem.locator('.pf-v6-c-badge').first()).toHaveText('5')
})

test('moves a template between folders from its row kebab', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  await page.getByRole('button', { name: 'Actions for centos-stream-9' }).click()
  await page.getByRole('menuitem', { name: 'Move to folder…' }).click()

  const modal = page.getByRole('dialog', { name: 'Move centos-stream-9 to folder' })
  await modal.getByText('staging', { exact: true }).click()
  await modal.getByRole('button', { name: 'Move', exact: true }).click()

  await expect(page.getByText('centos-stream-9 moved to staging')).toBeVisible()
  const tree = page.getByLabel('VM and template folders')
  await tree.getByText('staging', { exact: true }).click()
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  await expect(rows.filter({ hasText: 'centos-stream-9' })).toHaveCount(1)
})

test('row kebabs fold in Migrate (running VM) and Create VM (template)', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  // Migrate moved off a standalone row button into the VM kebab; db-01 stays
  // 'up', so an admin session always sees the item.
  await page.getByRole('button', { name: 'Actions for db-01' }).click()
  await expect(page.getByRole('menuitem', { name: 'Migrate', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  // Create VM moved off a standalone row button into the template kebab as its
  // top item (preseeded with the row's template).
  await page.getByRole('button', { name: 'Actions for centos-stream-9' }).click()
  await expect(page.getByRole('menuitem', { name: 'Create VM', exact: true })).toBeVisible()
})

test('the client-side name filter narrows both kinds', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  await page.getByLabel('Filter VMs and templates by name').fill('win2022')
  // win2022-ad (VM) + win2022-base (template)
  await expect(rows).toHaveCount(2)
})

// The inventory table now rides the shared COLUMNS+useColumnPrefs+ColumnPicker
// pattern (area 'inventory'); the toolbar picker hides pickable columns while
// Name stays pinned as the always-on identity column.
test('the column picker hides a data column and keeps Name pinned', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const table = page.locator('table[aria-label="VMs and templates"]')
  await expect(table.getByRole('columnheader', { name: 'Description' })).toBeVisible()

  await page.getByRole('button', { name: 'Manage columns' }).click()
  await page.getByRole('menuitem', { name: 'Description' }).click()
  await expect(table.getByRole('columnheader', { name: 'Description' })).toHaveCount(0)
  // Name is always-on: it survives and stays a visible header.
  await expect(table.getByRole('columnheader', { name: 'Name' })).toBeVisible()
})

// Clicking a header sorts the rows client-side (PF sortable Th): first click
// ascending, second descending; the arrow marks the active column via
// aria-sort. Name ascending is the baseline order.
test('clicking a column header sorts the rows', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const table = page.locator('table[aria-label="VMs and templates"]')
  const rows = table.locator('tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  const nameHeader = table.getByRole('columnheader', { name: 'Name' })
  await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
  const firstAsc = await rows.first().locator('td[data-label="Name"]').innerText()

  // second click on the active column flips the direction — the first row
  // changes (fixtures span b… through w…, so the two ends differ)
  await nameHeader.getByRole('button').click()
  await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
  const firstDesc = await rows.first().locator('td[data-label="Name"]').innerText()
  expect(firstDesc).not.toBe(firstAsc)

  // sorting by another column moves the arrow there and deactivates Name
  const statusHeader = table.getByRole('columnheader', { name: 'Status' })
  await statusHeader.getByRole('button').click()
  await expect(statusHeader).toHaveAttribute('aria-sort', 'ascending')
  await expect(nameHeader).not.toHaveAttribute('aria-sort', 'descending')
})

// Webadmin-style row multi-select: plain click selects, shift extends the
// range, ctrl/cmd toggles — the toolbar reports the live count. Clicks land
// on the Description cell (never a link/button, so the row handler owns them).
test('row multi-select: click, shift-range, ctrl-toggle, clear', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  await rows.nth(0).locator('td[data-label="Description"]').click()
  await expect(page.getByText('1 selected')).toBeVisible()

  await rows
    .nth(3)
    .locator('td[data-label="Description"]')
    .click({ modifiers: ['Shift'] })
  await expect(page.getByText('4 selected')).toBeVisible()

  await rows
    .nth(1)
    .locator('td[data-label="Description"]')
    .click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByText('3 selected')).toBeVisible()

  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect(page.getByText('3 selected')).toHaveCount(0)
})

// Client-side CSV export: visible sortable columns × every filtered row.
test('Export CSV downloads the current view', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^vms-templates-\d{4}-\d{2}-\d{2}\.csv$/)

  const csv = readFileSync((await download.path()) ?? '', 'utf-8')
  const [header] = csv.split('\r\n')
  expect(header).toContain('Name')
  expect(header).toContain('Status')
  // rows beyond page 1 export too (the fixture set + VITE_MOCK_SCALE extras)
  expect(csv).toContain('build-runner')
  expect(csv.split('\r\n').length - 2).toBeGreaterThanOrEqual(12)
})

// Bulk "Add tag": right-clicking a row inside a multi-select offers Add tag
// for the WHOLE selection; the modal titles itself with the target count and
// saving attaches the checked tag to every selected VM.
test('bulk right-click adds a tag to every selected VM', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  // select two VM rows (db-01 and web-01 are plain fixture VMs)
  const dbRow = rows.filter({ has: page.getByRole('link', { name: 'db-01', exact: true }) })
  const webRow = rows.filter({ has: page.getByRole('link', { name: 'web-01', exact: true }) })
  await dbRow.locator('td[data-label="Description"]').click()
  await webRow.locator('td[data-label="Description"]').click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByText('2 selected')).toBeVisible()

  // right-click one of the selected rows → Add tag targets both
  await webRow.locator('td[data-label="Description"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Add tag' }).click()
  const modal = page.getByRole('dialog', { name: 'Add tags to 2 VMs' })
  await expect(modal).toBeVisible()

  // check the first unchecked label and save
  const firstBox = modal.getByRole('checkbox').first()
  await firstBox.setChecked(true)
  await modal.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Tags updated for 2 VMs')).toBeVisible()
})

// Regression: the kebab (left-click) path is a plain PF Dropdown, which
// closes on any click outside its menu — including clicks in the modal it
// opens (portaled to body). Without the menu-click shield, clicking a
// checkbox inside the Add-tag modal unmounted the modal. Interacting must
// keep it open through to Save.
test('kebab Add tag opens a modal that survives interaction', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12)

  await page.getByRole('button', { name: 'Actions for db-01' }).click()
  await page.getByRole('menuitem', { name: 'Add tag' }).click()

  const modal = page.getByRole('dialog', { name: 'Add tags to db-01' })
  await expect(modal).toBeVisible()

  // clicking a checkbox inside the modal must NOT dismiss it — pick one that
  // is not already checked so the toggle dirties the form (enabling Save)
  await modal.locator('input[type=checkbox]:not(:checked)').first().check()
  // the modal is still here (the shield stopped the click from closing the
  // kebab) and Save is now enabled
  const save = modal.getByRole('button', { name: 'Save' })
  await expect(modal).toBeVisible()
  await expect(save).toBeEnabled()

  await save.click()
  await expect(page.getByText('Tags updated for db-01')).toBeVisible()
})
