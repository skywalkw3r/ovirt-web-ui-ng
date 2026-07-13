import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

// Gate: 'critical' and 'serious' violations fail the suite; 'moderate' and
// 'minor' still show up in axe's report locally but do not block. Each scan
// waits for page-specific content first so axe sees the real page, not the
// loading skeletons.
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

test('login page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('dashboard has no serious accessibility violations', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  // The status donut is the last card to settle; scanning mid-render would
  // miss the chart's accessible title. That title is an SVG <title> element,
  // which is never "visible" — attached is the strongest waitable state.
  await expect(page.getByText('Virtual machines by status')).toBeAttached()

  await expectNoSeriousViolations(page)
})

test('VM list has no serious accessibility violations', async ({ page }) => {
  await login(page, { path: '/vms' })
  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  await expect(rows.first()).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('VM details page has no serious accessibility violations', async ({ page }) => {
  // web-01 (vm-01) carries snapshots, disks, NICs and labels, so the scan
  // covers every populated details panel.
  await login(page, { path: '/vms/vm-01' })
  await expect(page.getByRole('heading', { name: 'web-01', exact: true })).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('New host dialog has no serious accessibility violations', async ({ page }) => {
  await login(page, { path: '/hosts' })
  const rows = page.locator('table[aria-label="Hosts"] tbody tr')
  await expect(rows.first()).toBeVisible()

  // Scan with the create dialog open so its form fields, tab rail and helper
  // texts are in the tree (the modal renders in a portal on the same page).
  await page.getByRole('button', { name: 'New host' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: 'Host name' })).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('VM list with a folder selected has no serious accessibility violations', async ({ page }) => {
  // Breadcrumb, count badges and the folder empty-state variants all render
  // in this state — the surfaces the folder work added to the VMs page.
  await login(page, { path: '/vms?folder=tag-web' })
  const rows = page.locator('table[aria-label="Virtual machines"] tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(page.getByLabel('Folder path')).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('Label manager with the edit dialog open has no serious violations', async ({ page }) => {
  await login(page, { path: '/vms' })
  await page.getByRole('button', { name: 'Labels', exact: true }).click()
  const manager = page.getByRole('dialog', { name: 'Manage labels' })
  await expect(manager).toBeVisible()

  // Scan with the edit dialog (rename + recolor) stacked on the manager, so
  // both the create form and the nested modal's fields are in the tree.
  await manager.getByRole('button', { name: 'Edit label pci-dss' }).click()
  await expect(page.getByRole('dialog', { name: "Edit label 'pci-dss'" })).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('VMs & Templates view has no serious accessibility violations', async ({ page }) => {
  await login(page, { path: '/vms-templates' })
  const rows = page.locator('table[aria-label="VMs and templates"] tbody tr')
  // 10 fixture VMs (incl. the HostedEngine VM) + 3 non-Blank templates
  await expect(rows).toHaveCount(13)

  await expectNoSeriousViolations(page)
})

test('Hosts & Clusters view has no serious accessibility violations', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })
  await expect(
    page.getByLabel('Infrastructure tree').getByText('node-01', { exact: true }),
  ).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('events page has no serious accessibility violations as admin', async ({ page }) => {
  await login(page, { path: '/events' })
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible()
  await expect(page.getByText('User admin@internal logged in.')).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('Users list has no serious accessibility violations as admin', async ({ page }) => {
  // The redesigned Users list: initials avatars (aria-hidden), composed
  // identity cells, domain chips, mailto email links and the column picker all
  // render here, so the scan covers the whole surface.
  await login(page, { path: '/users' })
  const rows = page.locator('table[aria-label="Users"] tbody tr')
  await expect(rows.first()).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('User detail page has no serious accessibility violations as admin', async ({ page }) => {
  // user-04 (jdoe) carries a full name, email, domain and group membership, so
  // the header meta line and every populated tab are in the tree.
  await login(page, { path: '/users/user-04' })
  await expect(page.getByRole('heading', { name: 'Jane Doe', exact: true })).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('Platform settings page has no serious accessibility violations as admin', async ({
  page,
}) => {
  // The staged form (switch, severity radios, upload control, field-help
  // popover triggers) plus a live banner preview all land in the tree.
  await login(page, { path: '/platform-settings' })
  await expect(page.getByRole('heading', { name: 'Platform settings' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Show announcement banner' })).toBeVisible()
  await page.getByLabel('Message', { exact: true }).fill('Preview for the axe run')

  await expectNoSeriousViolations(page)
})
