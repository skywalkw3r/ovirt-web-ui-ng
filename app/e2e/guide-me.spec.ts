import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Guide Me for data centers and clusters: opened after create (as webadmin
// does) and from the detail pages' kebab; its steps open the existing dialogs
// pre-scoped to the entity, and the guide returns when that dialog closes.

test('a new data center opens its Guide Me; a step opens New cluster scoped to it', async ({
  page,
}) => {
  await login(page, { path: '/datacenters' })
  await page.getByRole('button', { name: 'New data center' }).click()
  await page.getByLabel('Data center name').fill('guide-dc')
  await page.getByRole('button', { name: 'Save' }).click()

  const guide = page.getByRole('dialog', { name: 'Guide Me: guide-dc' })
  await expect(guide).toBeVisible()
  await expect(guide.getByText('Data center created.')).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Required steps' })).toBeVisible()
  // a host needs a cluster first
  await expect(guide.getByRole('button', { name: 'Configure host' })).toBeDisabled()
  await expect(guide.getByText('Add a cluster to the data center first.')).toBeVisible()

  // axe on the populated dialog (serious/critical gate, as in a11y.spec)
  await page.mouse.move(0, 0)
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  expect(
    results.violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => violation.id),
  ).toEqual([])

  await guide.getByRole('button', { name: 'Configure cluster' }).click()
  const newCluster = page.getByRole('dialog', { name: 'New cluster' })
  await expect(newCluster).toBeVisible()
  await expect(guide).toBeHidden()
  await expect(
    newCluster.getByRole('combobox', { name: 'Data center' }).locator('option:checked'),
  ).toHaveText('guide-dc')
  await newCluster.getByRole('button', { name: 'Cancel' }).click()

  // back to the guide, which can be put off
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: 'Configure later' }).click()
  await expect(guide).toBeHidden()
})

test('the cluster detail kebab opens a configured cluster guide', async ({ page }) => {
  await login(page, { path: '/clusters/cluster-01' })
  await page.getByRole('button', { name: 'More actions for Default' }).click()
  await page.getByRole('menuitem', { name: 'Guide Me' }).click()

  const guide = page.getByRole('dialog', { name: 'Guide Me: Default' })
  await expect(guide.getByText('Configuration completed')).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Add another host' })).toBeEnabled()
  // the footer button (the header X is also named Close)
  await guide.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click()
  await expect(guide).toBeHidden()
})

test('the data center detail kebab opens the guide for a configured data center', async ({
  page,
}) => {
  await login(page, { path: '/datacenters/dc-01' })
  await page.getByRole('button', { name: 'More actions for Default' }).click()
  await page.getByRole('menuitem', { name: 'Guide Me' }).click()

  const guide = page.getByRole('dialog', { name: 'Guide Me: Default' })
  await expect(guide.getByText('Configuration completed')).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Optional steps' })).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Add another cluster' })).toBeEnabled()

  // a storage step opens New storage domain scoped to this data center, with
  // an Up host of it preselected
  await guide.getByRole('button', { name: 'Add more storage' }).click()
  const newDomain = page.getByRole('dialog', { name: 'New storage domain' })
  await expect(newDomain).toBeVisible()
  await expect(
    newDomain.getByRole('combobox', { name: 'Data center' }).locator('option:checked'),
  ).toHaveText('Default')
  await expect(newDomain.getByRole('combobox', { name: 'Host to use' })).not.toHaveValue('')
  await newDomain.getByRole('button', { name: 'Cancel' }).click()
  await expect(guide).toBeVisible()
})
