// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetVmRouteMocks } from '../../api/mock/routes/vm'
import { listVmWatchdogs } from '../../api/resources/watchdogs'
import type { Vm } from '../../api/schemas/vm'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EditVmModal } from './EditVmModal'

// Drives the Edit VM modal against the mock engine: the HA tab's watchdog
// selects seed from GET /vms/{id}/watchdogs, and Save reconciles the device
// through the subcollection after the VM PUT. The resulting device state is
// read back through the resource (same mock engine) rather than spying calls.

const GiB = 1024 * 1024 * 1024

// Minimal read models for two mock fixtures: vm-02 carries a watchdog in the
// mock (routes/vm.ts) and runs; vm-05 has none and is treated as down.
function vmFixture(id: string, name: string, status: string): Vm {
  return {
    id,
    name,
    status,
    memory: 4 * GiB,
    memory_policy: { guaranteed: 4 * GiB, max: 16 * GiB },
    cluster: { id: 'cluster-01' },
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: 1, threads: 1 } },
  } as Vm
}

afterEach(() => resetVmRouteMocks())

async function openHaTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('tab', { name: 'High Availability' }, { timeout: FIND_TIMEOUT_MS }),
  )
}

const modelSelect = () =>
  screen.findByRole('combobox', { name: 'Watchdog model' }, { timeout: FIND_TIMEOUT_MS })

describe('EditVmModal watchdog', () => {
  it('seeds the loaded device and removes it through the Next-Run path on a running VM', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-02', 'web-02', 'up')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)

    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).value).toBe('i6300esb'))
    const action = screen.getByRole('combobox', { name: 'Watchdog action' })
    expect((action as HTMLSelectElement).value).toBe('reset')
    // x86_64 only offers the PCI model (plus "No watchdog")
    expect(
      within(model)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No watchdog', 'i6300esb'])

    await user.selectOptions(model, '')
    expect((action as HTMLSelectElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // a watchdog change on a running VM is next-run
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Apply after restart' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    await expect(listVmWatchdogs('vm-02')).resolves.toEqual([])
  })

  it('adds a watchdog to a VM that has none, saving straight through when down', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-05', 'vm-05', 'down')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)

    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).disabled).toBe(false))
    expect((model as HTMLSelectElement).value).toBe('')
    await user.selectOptions(model, 'i6300esb')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Watchdog action' }), 'poweroff')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByRole('button', { name: 'Apply after restart' })).toBeNull()
    await expect(listVmWatchdogs('vm-05')).resolves.toEqual([
      expect.objectContaining({ model: 'i6300esb', action: 'poweroff' }),
    ])
  })
})
