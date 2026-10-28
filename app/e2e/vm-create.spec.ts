import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('creates a VM from the centos template and lands on its details page', async ({ page }) => {
  // Unique per run: mock state persists for the dev-server session and the
  // engine rejects duplicate names.
  const vmName = `e2e-vm-${Date.now()}`

  await login(page, { path: '/vms' })
  await page.getByRole('button', { name: 'Create virtual machine' }).click()

  const wizard = page.getByRole('dialog')

  // Template step
  await wizard.locator('tr').filter({ hasText: 'centos-stream-9' }).getByRole('radio').check()
  await wizard.getByRole('button', { name: 'Next' }).click()

  // General step — role+accessible-name, since the raw <label> text carries
  // the required-indicator asterisk that getByLabel would trip over.
  await wizard.getByRole('textbox', { name: 'Name', exact: true }).fill(vmName)
  await wizard.getByRole('combobox', { name: 'Cluster' }).selectOption('Default')
  await wizard.getByRole('button', { name: 'Next' }).click()

  // Resources and Cloud-init keep their defaults
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()

  // Review — exact:true keeps the footer button distinct from the wizard's
  // 'Close create virtual machine wizard' aria-label.
  await wizard.getByRole('button', { name: 'Create virtual machine', exact: true }).click()

  await expect(page.getByText(`Virtual machine ${vmName} created`).first()).toBeVisible()
  await expect(page).toHaveURL(/\/vms\/[^/]+$/)
  // exact:true — the success toast's own heading also contains the VM name
  await expect(page.getByRole('heading', { name: vmName, exact: true })).toBeVisible()
})

test('Templates page Create VM preseeds the wizard and Review shows the template', async ({
  page,
}) => {
  await login(page, { path: '/templates' })

  // Per-row preseed action: the wizard opens on General with the row's
  // template already selected, so no Template-step interaction is needed.
  await page
    .locator('tr')
    .filter({ hasText: 'centos-stream-9' })
    .getByRole('button', { name: 'Create VM' })
    .click()

  const wizard = page.getByRole('dialog')
  await expect(wizard.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()

  await wizard.getByRole('textbox', { name: 'Name', exact: true }).fill(`e2e-preseed-${Date.now()}`)
  await wizard.getByRole('combobox', { name: 'Cluster' }).selectOption('Default')
  await wizard.getByRole('button', { name: 'Next' }).click()

  // Resources and Cloud-init keep their defaults
  await wizard.getByRole('button', { name: 'Next' }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()

  // On Review (the save button is its footer) the description list carries
  // the preseeded template even though its step was never interacted with.
  await expect(
    wizard.getByRole('button', { name: 'Create virtual machine', exact: true }),
  ).toBeVisible()
  await expect(wizard.getByText('centos-stream-9')).toBeVisible()

  // The Template step stays revisitable for swapping: it is marked visited,
  // and jumping back shows its radio already checked.
  await wizard.getByRole('button', { name: 'Template', exact: true }).click()
  await expect(
    wizard.locator('tr').filter({ hasText: 'centos-stream-9' }).getByRole('radio'),
  ).toBeChecked()
})
