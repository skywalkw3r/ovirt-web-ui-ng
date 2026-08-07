import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Resizable list columns (ResizableTh): drag a header edge, the column takes
// the dragged width, every column snapshots into localStorage (the fixed-
// layout freeze), and the widths survive navigation. Keyboard path drives the
// same commit; ColumnPicker's Reset restores the fluid grid.

test('dragging a header edge resizes the column and persists the grid', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const nameTh = page.locator('th[data-app-column="name"]')
  await expect(nameTh).toBeVisible()
  const before = (await nameTh.boundingBox())!.width

  const handle = nameTh.locator('.app-col-resizer')
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 120, grip.y + grip.height / 2, { steps: 5 })
  await page.mouse.up()

  await expect.poll(async () => (await nameTh.boundingBox())!.width).toBeGreaterThan(before + 100)

  // the first drag snapshots the whole row, not just the dragged column
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('console-columns') ?? '{}') as Record<
        string,
        { widths?: Record<string, number> }
      >,
  )
  expect(stored.inventory?.widths?.name).toBeGreaterThan(before + 100)
  expect(stored.inventory?.widths?.status).toBeGreaterThan(0)

  // and the table switched to the fixed-layout scroll model
  await expect(page.locator('table.app-table-fixed')).toBeVisible()
})

test('the resize handle is keyboard operable', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const statusTh = page.locator('th[data-app-column="status"]')
  await expect(statusTh).toBeVisible()
  const before = (await statusTh.boundingBox())!.width

  const handle = statusTh.locator('.app-col-resizer')
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')

  // 3 × 8px steps
  await expect
    .poll(async () => (await statusTh.boundingBox())!.width)
    .toBeGreaterThanOrEqual(before + 20)
})

test('column Reset clears dragged widths and restores the fluid grid', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const statusTh = page.locator('th[data-app-column="status"]')
  await expect(statusTh).toBeVisible()

  const handle = statusTh.locator('.app-col-resizer')
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('table.app-table-fixed')).toBeVisible()

  await page.getByRole('button', { name: 'Manage columns' }).click()
  await page.getByRole('menuitem', { name: 'Reset to default' }).click()

  await expect(page.locator('table.app-table-fixed')).toHaveCount(0)
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('console-columns') ?? '{}') as Record<string, unknown>,
  )
  expect(stored.inventory).toBeUndefined()
})
