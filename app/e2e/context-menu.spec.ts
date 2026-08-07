import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { login } from './helpers'

// vCenter-style right-click context menus (components/context-menu): folder
// tree nodes, VM table rows, and Hosts & Clusters tree nodes open their
// kebab-parity action menus at the cursor. Each test gets a fresh page (and
// therefore pristine in-browser mock fixtures), so legacy-erp always starts
// powered off and the folder tree holds prod(web, db) + staging.

// Row locator for the VMs table, anchored on the row's name link so it
// survives column reordering (same pattern as vm-lifecycle.spec).
function vmRow(page: Page, name: string) {
  return page.locator('tr').filter({ has: page.getByRole('link', { name, exact: true }) })
}

// Right-click `target` and wait for its context menu, retrying as a unit:
// under parallel load a background poll can re-render PF trees/tables and
// swallow the click (same self-healing retry as tag-manager.spec's folder
// select). Re-clicking is idempotent — a repeat right-click on the same node
// just replaces the menu.
async function openContextMenu(page: Page, target: Locator, menuName: string): Promise<Locator> {
  const menu = page.getByRole('menu', { name: menuName })
  await expect(async () => {
    await target.click({ button: 'right' })
    await expect(menu).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
  return menu
}

test('creates a folder from the tree context menu', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  const menu = await openContextMenu(
    page,
    tree.getByText('prod', { exact: true }),
    'Actions for prod',
  )
  await menu.getByRole('menuitem', { name: 'New folder…' }).click()

  // The create modal reuses the Tag manager's wording; its title doubles as
  // the name field's label.
  const dialog = page.getByRole('dialog', { name: 'New folder in prod' })
  await dialog.getByLabel('New folder in prod').fill('archive')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByText('Tag archive created').first()).toBeVisible()
  // prod is expanded by default, so the new child node shows immediately.
  await expect(tree.getByText('archive', { exact: true })).toBeVisible()
})

test('rejects an invalid folder name up front with a specific message', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  const menu = await openContextMenu(
    page,
    tree.getByText('prod', { exact: true }),
    'Actions for prod',
  )
  await menu.getByRole('menuitem', { name: 'New folder…' }).click()

  const dialog = page.getByRole('dialog', { name: 'New folder in prod' })
  // a space is invalid (engine allows only letters/numbers/-/_): the field
  // flags it inline and Create stays disabled — no generic engine fault
  await dialog.getByLabel('New folder in prod').fill('has space')
  await expect(
    dialog.getByText('Only letters, numbers, hyphens (-) and underscores (_) are allowed'),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeDisabled()

  // correcting the name clears the error and re-enables Create
  await dialog.getByLabel('New folder in prod').fill('valid-name')
  await expect(
    dialog.getByText('Only letters, numbers, hyphens (-) and underscores (_) are allowed'),
  ).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeEnabled()
})

test('renames a folder via keyboard-invoked context menu', async ({ page }) => {
  await login(page, { path: '/vms' })
  const tree = page.getByLabel('Virtual machine folders')
  // Keyboard right-click (Shift+F10 / the Menu key) fires contextmenu with no
  // pointer coords; dispatchEvent mirrors that and exercises the rect
  // fallback that anchors the menu to the node instead of the viewport corner.
  const node = tree.getByText('staging', { exact: true })
  await expect(node).toBeVisible()
  const menu = page.getByRole('menu', { name: 'Actions for staging' })
  await expect(async () => {
    await node.dispatchEvent('contextmenu')
    await expect(menu).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
  await menu.getByRole('menuitem', { name: 'Rename…' }).click()

  const rename = page.getByRole('dialog', { name: "Rename folder 'staging'" })
  await rename.getByLabel('New name').fill('qa')
  await rename.getByRole('button', { name: 'Rename', exact: true }).click()

  await expect(page.getByText('Tag qa updated').first()).toBeVisible()
  await expect(tree.getByText('qa', { exact: true })).toBeVisible()
  await expect(tree.getByText('staging', { exact: true })).toHaveCount(0)
})

test('moves a VM to a folder from its row context menu', async ({ page }) => {
  await login(page, { path: '/vms' })
  const menu = await openContextMenu(page, vmRow(page, 'legacy-erp'), 'Actions for legacy-erp')
  await menu.getByRole('menuitem', { name: 'Move to folder…' }).click()

  // The picker opens on top of the still-open menu (kebab parity: the menu
  // waits underneath item-owned modals). legacy-erp carries only a label tag,
  // so 'No folder' renders as its current folder.
  const picker = page.getByRole('dialog', { name: 'Move legacy-erp to folder' })
  await expect(picker.getByText('No folder', { exact: true })).toBeVisible()
  await picker.getByText('staging', { exact: true }).click()
  await picker.getByRole('button', { name: 'Move', exact: true }).click()

  await expect(page.getByText('legacy-erp moved to staging').first()).toBeVisible()
})

test('starts a powered-off VM from its row context menu', async ({ page }) => {
  await login(page, { path: '/vms' })
  const row = vmRow(page, 'legacy-erp')
  // Fresh fixtures: legacy-erp begins down, so Start is offered.
  await expect(row.locator('td[data-label="Status"]')).toHaveText('Powered off')

  const menu = await openContextMenu(page, row, 'Actions for legacy-erp')
  await menu.getByRole('menuitem', { name: 'Start', exact: true }).click()

  await expect(page.getByText('Start requested for legacy-erp').first()).toBeVisible()
})

test('closes on Escape and outside click; a second right-click swaps menus', async ({ page }) => {
  await login(page, { path: '/vms' })

  const firstMenu = await openContextMenu(page, vmRow(page, 'web-01'), 'Actions for web-01')
  // The menu opens focused on its first item, so Escape lands inside it.
  await expect(firstMenu.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(firstMenu).toHaveCount(0)

  // Left-click anywhere outside dismisses (PF's built-in handling); the page
  // heading carries no click behavior of its own.
  await openContextMenu(page, vmRow(page, 'web-01'), 'Actions for web-01')
  await page.getByRole('heading', { name: 'Virtual machines' }).click()
  await expect(firstMenu).toHaveCount(0)

  // Right-clicking another row replaces the open menu — one menu at a time.
  await openContextMenu(page, vmRow(page, 'web-01'), 'Actions for web-01')
  await openContextMenu(page, vmRow(page, 'db-01'), 'Actions for db-01')
  await expect(firstMenu).toHaveCount(0)
  await expect(page.locator('.app-context-menu')).toHaveCount(1)
})

test('host node context menu opens details and mirrors the kebab', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })
  const tree = page.getByLabel('Infrastructure tree')
  const node = tree.getByText('node-01', { exact: true })
  await expect(node).toBeVisible()

  const menu = await openContextMenu(page, node, 'Actions for node-01')
  // Kebab-parity spot check: Assign tags applies in every host state, so it
  // is always part of the HostActionsMenu item set.
  await expect(menu.getByRole('menuitem', { name: 'Assign tags' })).toBeVisible()

  await menu.getByRole('menuitem', { name: 'Open details' }).click()
  await expect(page).toHaveURL(/\/hosts\/host-01$/)
  await expect(page.getByRole('heading', { name: 'node-01', exact: true })).toBeVisible()
})

// Gate: 'critical' and 'serious' violations fail; 'moderate' and 'minor'
// still show up in axe's local report but do not block (same inline helper
// convention as a11y.spec).
async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  const gating = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  )
  // Flattened to readable strings so a failure names the rule and the nodes.
  expect(
    gating.map(
      (violation) =>
        `${violation.impact}: ${violation.id} — ` +
        violation.nodes.map((node) => node.target.join(' ')).join(', '),
    ),
  ).toEqual([])
}

test('VM list with an open context menu has no serious a11y violations', async ({ page }) => {
  await login(page, { path: '/vms' })
  const menu = await openContextMenu(page, vmRow(page, 'web-01'), 'Actions for web-01')
  // The deferred first-item focus has settled once an item holds focus, so
  // axe scans the menu in its steady open state.
  await expect(menu.getByRole('menuitem').first()).toBeFocused()
  // PF menus fade in over ~200ms (--pf-v6-c-menu--TransitionDuration). A scan
  // mid-fade sees every color at reduced alpha and reports phantom contrast
  // failures on the danger items (measured 6.83:1 at steady state — passing),
  // so wait for the fade to finish before analyzing.
  await expect(page.locator('.app-context-menu')).toHaveCSS('opacity', '1')
  // The auto-focused first item shows its own descriptive tooltip, which fades
  // in on its own timer AFTER the menu settles — scan it mid-fade and axe
  // reports the same phantom contrast failure. Let it reach full opacity too.
  const tooltip = page.locator('.pf-v6-c-tooltip')
  if (await tooltip.count()) await expect(tooltip.first()).toHaveCSS('opacity', '1')

  await expectNoSeriousViolations(page)
})
