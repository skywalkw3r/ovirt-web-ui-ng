import { expect, test, type Locator, type Page } from '@playwright/test'
import { login } from './helpers'

const rowFor = (page: Page, name: string): Locator =>
  page.locator('tr').filter({ has: page.getByRole('link', { name, exact: true }) })

// PF stamps dataLabel onto the cell as data-label, so this survives the
// selection checkbox column shifting the positional indexes.
const statusCellOf = (row: Locator): Locator => row.locator('td[data-label="Status"]')

test('bulk shutdown then start web-01 and web-02 via the selection toolbar', async ({ page }) => {
  await login(page, { path: '/vms' })

  const names = ['web-01', 'web-02']
  const rows = names.map((name) => rowFor(page, name))

  // Mock state persists for the dev-server session: let any in-flight
  // transition settle, then start a VM a crashed prior run left down —
  // bulk buttons only enable when EVERY selected VM allows the action.
  // 'up'/'down' render as 'Running'/'Powered off' (statusLabel display names,
  // capitalized by statusText).
  for (const [index, row] of rows.entries()) {
    const statusCell = statusCellOf(row)
    await expect(statusCell).toHaveText(/^(Running|Powered off)$/, { timeout: 30_000 })
    if ((await statusCell.innerText()).trim() === 'Powered off') {
      await row.getByRole('button', { name: `Actions for ${names[index]}` }).click()
      await page.getByRole('menuitem', { name: 'Start' }).click()
    }
    await expect(statusCell).toHaveText('Running', { timeout: 30_000 })
  }

  for (const row of rows) await row.getByRole('checkbox').check()

  // Shutdown is destructive, so it sits behind a ConfirmModal listing the
  // selected VM names.
  await page.getByRole('button', { name: 'Shutdown' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('web-01')
  await expect(dialog).toContainText('web-02')
  await dialog.getByRole('button', { name: 'Shutdown' }).click()

  // ONE aggregate toast for the whole batch.
  await expect(page.getByText('Shutdown requested for 2 VMs').first()).toBeVisible()

  // powering_down settles to down after ~4s in the mock and the list polls
  // every 10s, so allow a couple of poll cycles.
  for (const row of rows)
    await expect(statusCellOf(row)).toHaveText('Powered off', { timeout: 30_000 })

  // Refetches re-render the rows, so re-assert the selection (check() is a
  // no-op when it survived) and start them back — no confirm for Start.
  for (const row of rows) await row.getByRole('checkbox').check()
  const start = page.getByRole('button', { name: 'Start' })
  await expect(start).toBeEnabled()
  await start.click()

  await expect(page.getByText('Start requested for 2 VMs').first()).toBeVisible()
  for (const row of rows) await expect(statusCellOf(row)).toHaveText('Running', { timeout: 30_000 })
})

test('clicking a row opens the quick-look drawer and Open details navigates', async ({ page }) => {
  await login(page, { path: '/vms' })

  // A plain data cell stands in for "the row, not the name link" — clicking
  // the link would navigate instead of opening the drawer. db-01 stays 'up'
  // untouched by the other tests, so its details heading is stable.
  const row = rowFor(page, 'db-01')
  await row.locator('td[data-label="FQDN"]').click()

  const drawer = page.locator('.pf-v6-c-drawer__panel')
  await expect(drawer.getByText('db-01', { exact: true })).toBeVisible()

  await drawer.getByRole('link', { name: 'Open details' }).click()
  await expect(page).toHaveURL(/\/vms\/vm-03$/)
  await expect(page.getByRole('heading', { name: 'db-01', exact: true })).toBeVisible()
})

test('moves staging-app into prod/web via the kebab modal and back', async ({ page }) => {
  await login(page, { path: '/vms' })

  const tree = page.getByLabel('Virtual machine folders')
  const stagingLink = page.getByRole('link', { name: 'staging-app', exact: true })

  const moveTo = async (folderName: string) => {
    const row = rowFor(page, 'staging-app')
    await row.getByRole('button', { name: 'Actions for staging-app' }).click()
    await page.getByRole('menuitem', { name: /Move to folder/ }).click()
    const dialog = page.getByRole('dialog')
    // Single select in the modal's folder TreeView, then confirm.
    await dialog.getByText(folderName, { exact: true }).click()
    await dialog.getByRole('button', { name: 'Move' }).click()
    await expect(dialog).toBeHidden()
  }

  await expect(stagingLink).toBeVisible()
  await moveTo('web')

  // The folder filter picks up the new membership.
  await tree.getByText('web', { exact: true }).click()
  await expect(stagingLink).toBeVisible()

  // Clear the filter so the row is on screen again, then restore the
  // fixture state — folders.spec relies on 'web' holding exactly two VMs.
  await tree.getByText('All virtual machines', { exact: true }).click()
  await expect(rowFor(page, 'legacy-erp')).toBeVisible()
  await moveTo('staging')

  await tree.getByText('web', { exact: true }).click()
  await expect(stagingLink).toHaveCount(0)
  await tree.getByText('staging', { exact: true }).click()
  await expect(stagingLink).toBeVisible()
})

test('bulk moves web-01 and web-02 into staging via the selection toolbar', async ({ page }) => {
  await login(page, { path: '/vms' })
  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  await expect(rows.first()).toBeVisible()

  await rowFor(page, 'web-01').getByRole('checkbox').check()
  await rowFor(page, 'web-02').getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Move to folder…' }).click()

  // Batches never preselect: Move stays disabled until an explicit choice.
  const dialog = page.getByRole('dialog', { name: 'Move 2 VMs to folder' })
  await expect(dialog.getByRole('button', { name: 'Move', exact: true })).toBeDisabled()
  await dialog.getByText('staging', { exact: true }).click()
  await dialog.getByRole('button', { name: 'Move', exact: true }).click()

  await expect(page.getByText('2 VMs moved to staging')).toBeVisible()
  const tree = page.getByLabel('Virtual machine folders')
  await tree.getByText('staging', { exact: true }).click()
  await expect(rows).toHaveCount(3)

  // Restore the fixture state — folders.spec relies on 'web' holding two VMs.
  await rowFor(page, 'web-01').getByRole('checkbox').check()
  await rowFor(page, 'web-02').getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Move to folder…' }).click()
  const restore = page.getByRole('dialog', { name: 'Move 2 VMs to folder' })
  await restore.getByText('web', { exact: true }).click()
  await restore.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.getByText('2 VMs moved to web')).toBeVisible()
})
