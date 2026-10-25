// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Host } from '../../api/schemas/host'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { CopyHostNetworksModal } from './CopyHostNetworksModal'
import { HostActionsMenu } from './HostActionsMenu'

// Mock fixture hosts: node-01/02/03 share cluster-01 (Default); node-01 has
// three physical NICs (eno1-3, bond0 is a master), node-02/03 have none.
const host = (id: string, name: string, status = 'up'): Host =>
  ({ id, name, status, cluster: { id: 'cluster-01' } }) as Host

const findSourceSelect = () =>
  screen.findByRole('combobox', { name: 'Source host' }, { timeout: FIND_TIMEOUT_MS })

describe('CopyHostNetworksModal', () => {
  it('offers only same-cluster peers and keeps confirm disabled until one is picked', async () => {
    renderWithProviders(
      <CopyHostNetworksModal host={host('host-02', 'node-02')} onClose={() => {}} />,
    )
    const select = await findSourceSelect()
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toEqual(['Select a host', 'node-01', 'node-03'])
    expect(screen.getByRole('button', { name: 'Copy networks' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(screen.getByText(/will be replaced with the source host's/)).toBeDefined()
  })

  it('warns on an interface shortfall and shows the engine error inline, staying open', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <CopyHostNetworksModal host={host('host-02', 'node-02')} onClose={onClose} />,
    )
    await user.selectOptions(await findSourceSelect(), 'host-01')

    expect(
      await screen.findByText('Interface count mismatch', {}, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Copy networks' }))
    expect(
      await screen.findByText('Could not copy host networks', {}, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
    expect(
      screen.getAllByText(/Interface count of destination host has to be at least as high/).length,
    ).toBeGreaterThan(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('copies and closes on success', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <CopyHostNetworksModal host={host('host-01', 'node-01')} onClose={onClose} />,
    )
    await user.selectOptions(await findSourceSelect(), 'host-02')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy networks' }).hasAttribute('disabled')).toBe(
        false,
      ),
    )
    expect(screen.queryByText('Interface count mismatch')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Copy networks' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
  })
})

describe('HostActionsMenu: Copy host networks', () => {
  it('opens the copy dialog from the kebab for an eligible host', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostActionsMenu host={host('host-02', 'node-02')} />)
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Actions for node-02' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Copy host networks' }))
    expect(
      await screen.findByRole('dialog', { name: /Copy host networks to node-02/ }),
    ).toBeDefined()
  })

  it('hides the item while the host is in a status setup-networks rejects', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostActionsMenu host={host('host-02', 'node-02', 'installing')} />)
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Actions for node-02' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    await screen.findByRole('menuitem', { name: 'Assign tags' })
    expect(screen.queryByRole('menuitem', { name: 'Copy host networks' })).toBeNull()
  })
})
