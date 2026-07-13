import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The structural infrastructure pane: DC → cluster → host from entity links.
// The content pane switches by node kind — the root/DC and hosts scope the VM
// table; a cluster shows its HOSTS table under a cluster action bar.

test('the infrastructure tree scopes the content pane by host and cluster', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })
  const tree = page.getByLabel('Infrastructure tree')
  const rows = page.locator('table[aria-label="Virtual machines in the selected scope"] tbody tr')
  // Root scope defaults to the Clusters tab (outer-first order); the VMs tab
  // holds every fixture VM (9 workload VMs + the HostedEngine VM).
  await page.getByRole('tab', { name: 'Virtual machines' }).click()
  await expect(rows).toHaveCount(10)

  // Host scope: exactly the three VMs running on node-01 (web-01, db-01 and
  // the HostedEngine VM), with its header.
  await tree.getByText('node-01', { exact: true }).click()
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'node-01' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open details' })).toHaveAttribute(
    'href',
    '/hosts/host-01',
  )

  // Cluster scope: the pane shows the cluster identity (read-only — Edit/
  // Upgrade/Remove live on the detail page, reached via Open details) and
  // browse tabs. Hosts is the default tab and holds all three fixture hosts.
  // Both the DC and its cluster are named 'Default'; the DC parent renders
  // first, so the cluster node is the second match.
  await tree.getByText('Default', { exact: true }).nth(1).click()
  await expect(page.getByRole('heading', { name: 'Default' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open details' })).toHaveAttribute(
    'href',
    '/clusters/cluster-01',
  )
  // no cluster action bar — Edit/Upgrade/Remove are detail-page only
  await expect(page.getByRole('button', { name: 'Upgrade' })).toHaveCount(0)
  // the VMs tab was chosen earlier and persists into the cluster's set, so
  // switch to Hosts explicitly to see the cluster's three hosts
  await page.getByRole('tab', { name: 'Hosts', exact: true }).click()
  await expect(page.locator('table[aria-label="Hosts"] tbody tr')).toHaveCount(3)
  // Legacy-grid parity defaults: utilization bars + SPM ride along (the mock
  // 10G NIC feeds the Network gauge for up hosts).
  const hostsTable = page.locator('table[aria-label="Hosts"]')
  await expect(hostsTable.getByRole('columnheader', { name: 'Memory' })).toBeVisible()
  await expect(hostsTable.getByRole('columnheader', { name: 'CPU' })).toBeVisible()
  await expect(hostsTable.getByRole('columnheader', { name: 'SPM' })).toBeVisible()

  // lab-nested hosts the three gluster brick nodes — reached the same way (its
  // Hosts tab is the default).
  await tree.getByText('lab-nested', { exact: true }).click()
  await expect(page.locator('table[aria-label="Hosts"] tbody tr')).toHaveCount(3)
  await expect(page.getByRole('link', { name: 'gnode-01', exact: true })).toBeVisible()
})

// The scoped-VM table (root/host/DC scope) carries its own column picker
// (area 'infra-vms'), placed on the 'Virtual machines (N)' heading row; the
// cluster-node HOSTS table carries a second one (area 'infra-hosts').
test('the scoped-VM table has a working column picker', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })
  await page.getByRole('tab', { name: 'Virtual machines' }).click()
  const table = page.locator('table[aria-label="Virtual machines in the selected scope"]')
  await expect(table.getByRole('columnheader', { name: 'Description' })).toBeVisible()

  await page.getByRole('button', { name: 'Manage columns' }).click()
  await page.getByRole('menuitem', { name: 'Description' }).click()
  await expect(table.getByRole('columnheader', { name: 'Description' })).toHaveCount(0)
  await expect(table.getByRole('columnheader', { name: 'Name' })).toBeVisible()
})

test('the cluster hosts table has a working column picker', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })
  await page.getByLabel('Infrastructure tree').getByText('Default', { exact: true }).nth(1).click()
  await page.getByRole('tab', { name: 'Hosts', exact: true }).click()
  const table = page.locator('table[aria-label="Hosts"]')
  // the locating joins ship default-off in cluster scope — the tree selection
  // already states them, and webadmin itself defaults Hostname/IP off
  await expect(table.getByRole('columnheader', { name: 'Memory' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Cluster' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Manage columns' }).click()
  await page.getByRole('menuitem', { name: 'Cluster' }).click()
  await expect(table.getByRole('columnheader', { name: 'Cluster' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Name' })).toBeVisible()
})

test('Hosts & Clusters is admin-only', async ({ page }) => {
  await login(page, { username: 'demo@internal', path: '/hosts-clusters' })
  await expect(page.getByText('You do not have permission to view Hosts & Clusters')).toBeVisible()
})

// Right-click works anywhere on the tree row via the tree-wrapper delegation
// (the node icon sits outside the name span, so it locks in that the whole
// row — not just the text — opens the menu).
test('right-clicking a host row opens the host menu', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })
  const tree = page.getByLabel('Infrastructure tree')
  const hostRow = tree.getByText('node-01', { exact: true })
  const menu = page.getByRole('menu', { name: 'Actions for node-01' })
  await expect(async () => {
    await hostRow.click({ button: 'right' })
    await expect(menu).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
  await expect(menu.getByRole('menuitem', { name: 'Open details' })).toBeVisible()
})

// DC scope: the pane offers VMs / Hosts / Clusters tabs. The Clusters tab is
// webadmin's DC → Clusters subtab; clicking a row (not its name link) drills
// the tree selection into that cluster.
test('a data center offers a Clusters tab and a row click drills in', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })
  const tree = page.getByLabel('Infrastructure tree')
  // the DC node renders before its same-named cluster child
  await tree.getByText('Default', { exact: true }).nth(0).click()
  await page.getByRole('tab', { name: 'Clusters', exact: true }).click()

  const clustersTable = page.locator('table[aria-label="Clusters in the selected data center"]')
  await expect(clustersTable.getByRole('columnheader', { name: 'Host Count' })).toBeVisible()
  const defaultRow = clustersTable
    .locator('tbody tr')
    .filter({ has: page.getByRole('link', { name: 'Default', exact: true }) })
  await expect(defaultRow).toHaveCount(1)

  // click a data cell (compat version — not the name link) to drill into the
  // cluster; its identity takes over (read-only) and its default Hosts tab
  // holds 3
  await defaultRow.locator('td').nth(1).click()
  await expect(page.getByRole('link', { name: 'Open details' })).toBeVisible()
  await expect(page.locator('table[aria-label="Hosts"] tbody tr')).toHaveCount(3)
})

// Root scope: browse tabs in outer-first order — Clusters (default) / Hosts /
// Virtual machines.
test('the root pane offers Clusters / Hosts / Virtual machines tabs', async ({ page }) => {
  await login(page, { path: '/hosts-clusters' })

  // Clusters is the leftmost tab and the default; both fixture clusters show
  await expect(page.getByRole('tab', { name: 'Clusters', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const clusterRows = page.locator(
    'table[aria-label="Clusters in the selected data center"] tbody tr',
  )
  await expect(clusterRows).toHaveCount(2)

  // Hosts tab: every fixture host in one grid (3 Default + 3 gluster nodes)
  await page.getByRole('tab', { name: 'Hosts', exact: true }).click()
  await expect(page.locator('table[aria-label="Hosts"] tbody tr')).toHaveCount(6)

  // Virtual machines tab: every fixture VM
  await page.getByRole('tab', { name: 'Virtual machines' }).click()
  const vmRows = page.locator('table[aria-label="Virtual machines in the selected scope"] tbody tr')
  await expect(vmRows).toHaveCount(10)

  // selecting a host leaves tab-land: the host pane has no tab strip
  const tree = page.getByLabel('Infrastructure tree')
  await tree.getByText('node-01', { exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Clusters', exact: true })).toHaveCount(0)
})
