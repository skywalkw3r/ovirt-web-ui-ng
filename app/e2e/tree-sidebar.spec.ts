import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// The drag-resizable inventory tree sidebar (InventoryTreeSidebar): drag or
// arrow-key the 'Resize sidebar' separator, the committed pixel width lands
// under 'console-sidebar-width' and BOTH split views (VMs & Templates, Hosts
// & Clusters) share it — the sidebar keeps its size across reloads and when
// switching surfaces.

const sidebarHandle = (page: Page) => page.getByRole('separator', { name: 'Resize sidebar' })

test('dragging the sidebar handle resizes it and the width survives a reload', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const handle = sidebarHandle(page)
  await expect(handle).toBeVisible()
  const before = Number(await handle.getAttribute('aria-valuenow'))

  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 100, grip.y + grip.height / 2, { steps: 5 })
  await page.mouse.up()

  // the commit clamps to [220, 600], so the full +100 registers from the
  // 320px default; poll for the re-render that carries the stored width
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(before + 80)
  const committed = Number(await handle.getAttribute('aria-valuenow'))

  // The token is in-memory (see helpers.ts), so a fresh navigation bounces
  // through /login — signing back in is the reload for this app. The width
  // rides localStorage, which survives it.
  await login(page, { path: '/vms-templates' })
  await expect(handle).toBeVisible()
  const after = Number(await handle.getAttribute('aria-valuenow'))
  expect(Math.abs(after - committed)).toBeLessThanOrEqual(2)
})

test('the sidebar handle is keyboard operable', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const handle = sidebarHandle(page)
  await expect(handle).toBeVisible()
  const before = Number(await handle.getAttribute('aria-valuenow'))

  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')

  // 2 × 8px steps; ±1 tolerance because the first step commits from the
  // measured (possibly fractional) rendered width, which rounds
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThanOrEqual(before + 15)
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(before + 17)
})

test('the Hosts & Clusters view shares the same persisted width', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const handle = sidebarHandle(page)
  await expect(handle).toBeVisible()
  const before = Number(await handle.getAttribute('aria-valuenow'))

  // commit a width on VMs & Templates via the keyboard path
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThanOrEqual(before + 15)
  const committed = Number(await handle.getAttribute('aria-valuenow'))

  // switch surfaces client-side through the icon tab strip above the tree
  // (a page.goto would drop the in-memory session — see helpers.ts)
  await page.locator('nav.pf-v6-c-tabs').getByRole('link', { name: 'Hosts & Clusters' }).click()
  // role-scoped: the root pane's browse Tabs strip shares the same aria-label
  await expect(page.getByRole('tree', { name: 'Infrastructure tree' })).toBeVisible()

  // one shared storage key: the infra sidebar renders at the committed width
  await expect(handle).toBeVisible()
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(committed)
})
