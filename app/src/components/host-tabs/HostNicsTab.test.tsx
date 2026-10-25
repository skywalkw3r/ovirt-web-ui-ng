// @vitest-environment jsdom
import '../../test/env'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { HostNicsTab } from './HostNicsTab'

const findGrid = () =>
  screen.findByRole('grid', { name: 'Host network interfaces' }, { timeout: FIND_TIMEOUT_MS })

describe('HostNicsTab LLDP and Copy host networks', () => {
  it('opens a NIC LLDP view from the row kebab', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostNicsTab hostId="host-01" clusterId="cluster-01" />)
    await findGrid()

    await user.click(screen.getByRole('button', { name: 'Actions for eno2' }))
    await user.click(await screen.findByRole('menuitem', { name: 'View LLDP information' }))

    const dialog = await screen.findByRole('dialog', { name: 'LLDP information: eno2' })
    expect(
      await within(dialog).findByText(
        'port description: Summit300-48-Port 1001',
        {},
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeDefined()
  })

  it('offers Copy host networks in the toolbar for an eligible host', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostNicsTab hostId="host-01" clusterId="cluster-01" />)
    const copy = await screen.findByRole(
      'button',
      { name: 'Copy host networks' },
      { timeout: FIND_TIMEOUT_MS },
    )
    await user.click(copy)
    expect(
      await screen.findByRole('dialog', { name: /Copy host networks to node-01/ }),
    ).toBeDefined()
  })

  it('puts an LLDP trigger on each NIC card and bond member in Setup Networks', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostNicsTab hostId="host-01" clusterId="cluster-01" />)
    await findGrid()
    await user.click(screen.getByRole('button', { name: 'Setup networks' }))

    // eno2/eno3 are standalone NIC cards; eno1 is bond0's member
    for (const nic of ['eno1', 'eno2', 'eno3']) {
      expect(
        await screen.findByRole(
          'button',
          { name: `Show LLDP information for ${nic}` },
          { timeout: FIND_TIMEOUT_MS },
        ),
      ).toBeDefined()
    }
  })
})
