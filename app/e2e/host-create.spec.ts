import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The New Host CRUD probe: open the dialog, trip the inline validation, fill
// the sections, save, and watch the row walk the mock install pipeline
// (installing → initializing → up). The mock transitions take ~12s but the
// hosts list polls on a 30s floor, so the walk is driven with the toolbar's
// "Refresh now" instead of waiting out the poll.
test('creates a host from the New host dialog and watches it install and come up', async ({
  page,
}) => {
  // Unique per run: mock state persists for the dev-server session and the
  // handler rejects duplicate names with a 409.
  const hostName = `e2e-host-${Date.now()}`

  await login(page, { path: '/hosts' })
  await page.getByRole('button', { name: 'New host' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: 'Host name' })).toBeVisible()

  // Validation probe: a malformed address shows the ported engine rule's
  // inline error and keeps Save gated even with everything else filled in.
  await dialog.getByRole('textbox', { name: 'Host name' }).fill(hostName)
  await dialog.getByRole('textbox', { name: 'Hostname or IP address' }).fill('bad..address')
  await expect(dialog.getByText('Enter a valid hostname or IP address')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()

  await dialog
    .getByRole('textbox', { name: 'Hostname or IP address' })
    .fill(`${hostName}.lab.local`)
  // mock backend only — any password works and is never stored or echoed
  await dialog.getByRole('textbox', { name: 'Root password' }).fill('fixture-password')

  // The sections ported from the edit modal are reachable and writable.
  // force: PF renders the switch input visually hidden behind its styled
  // toggle span, which intercepts pointer events; check() still asserts the
  // resulting checked state.
  await dialog.getByRole('tab', { name: 'Console and GPU' }).click()
  await dialog.getByRole('switch', { name: 'Override display address' }).check({ force: true })
  await dialog.getByRole('textbox', { name: 'Console display address' }).fill('console.lab.local')
  await dialog.getByRole('tab', { name: 'Kernel' }).click()
  await dialog.getByRole('textbox', { name: 'Custom kernel command line' }).fill('intel_iommu=on')
  await dialog.getByRole('tab', { name: 'Hosted Engine' }).click()
  await expect(dialog.getByRole('switch', { name: 'Deploy hosted engine' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Save' }).click()

  // POST /hosts only kicks off the install — the toast says so, the dialog
  // closes, and the new row appears in the transitional 'installing' state.
  await expect(page.getByText(`Installing host ${hostName}`).first()).toBeVisible()
  await expect(dialog).not.toBeVisible()
  const row = page.locator('tr').filter({ hasText: hostName })
  // Status is now a colored icon; its label rides the hover title (+ sr-only text).
  await expect(row.getByTitle('Installing', { exact: true })).toBeVisible()

  // Drive refetches until monitoring brings the host up (~12s of mock
  // transitions: install + reboot window, then initializing).
  await expect(async () => {
    await page.getByRole('button', { name: 'Refresh now' }).click()
    await expect(row.getByTitle('Up', { exact: true })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
})
