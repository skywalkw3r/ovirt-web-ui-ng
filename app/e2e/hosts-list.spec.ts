import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The flat /hosts grid's row furniture. The hosted-engine crowns discriminate
// by the HostedEngine VM's own host link — both fixture HE nodes report
// hosted_engine.active=true (HA-agent state), so node-01 (running the engine
// VM) must wear the golden crown and node-02 the grey standby one. Pending
// updates render as the icon-only orange badge with the wording on hover and
// for screen readers, and the Cluster cell links to the cluster detail page.
test('HE crowns follow engine-VM placement; updates badge and cluster link render', async ({
  page,
}) => {
  await login(page, { path: '/hosts' })
  const rowFor = (name: string) =>
    page.locator('tbody tr').filter({ has: page.getByRole('link', { name, exact: true }) })

  // node-01 runs the HostedEngine VM; node-02 is an HE-capable standby
  await expect(
    rowFor('node-01').getByRole('img', { name: 'Hosted engine — running on this host' }),
  ).toBeVisible()
  await expect(
    rowFor('node-02').getByRole('img', { name: 'Hosted engine host — standby' }),
  ).toBeVisible()

  // node-03 has update_available: the icon-only badge carries hidden text for
  // screen readers and surfaces the wording as a tooltip on hover
  await expect(rowFor('node-03').getByText('Updates available')).toHaveCount(1)
  await rowFor('node-03').locator('.app-status-label.pf-m-orange').hover()
  await expect(page.getByRole('tooltip', { name: 'Updates available' })).toBeVisible()

  // the Cluster cell is a link to the cluster detail page
  await expect(
    rowFor('node-01').getByRole('link', { name: 'Default', exact: true }),
  ).toHaveAttribute('href', '/clusters/cluster-01')
})
