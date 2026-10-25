// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { HostVmsTab } from './HostVmsTab'

// PF's Table renders role="grid"; the header row is the first row.
const findGrid = () =>
  screen.findByRole('grid', { name: 'Virtual machines on this host' }, { timeout: FIND_TIMEOUT_MS })
const rowNames = (grid: HTMLElement) =>
  within(grid)
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent)

describe('HostVmsTab filter', () => {
  it('defaults to Running and switches to Pinned to host / Both (de-duplicated)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostVmsTab hostName="node-01" hostId="host-01" />, {
      path: '/hosts/host-01',
    })

    const running = rowNames(await findGrid())
    expect(running).toContain('web-01')
    expect(screen.getByRole('button', { name: 'Running' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    // web-01 is the fixture's only VM pinned to host-01
    await user.click(screen.getByRole('button', { name: 'Pinned to host' }))
    await waitFor(async () => expect(rowNames(await findGrid())).toEqual(['web-01']), {
      timeout: FIND_TIMEOUT_MS,
    })

    // web-01 both runs on and is pinned to host-01: one row, not two
    await user.click(screen.getByRole('button', { name: 'Both' }))
    await waitFor(
      async () => expect([...rowNames(await findGrid())].sort()).toEqual([...running].sort()),
      { timeout: FIND_TIMEOUT_MS },
    )
  })

  it('shows the pinned-specific empty state when nothing is pinned to the host', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HostVmsTab hostName="node-03" hostId="host-03" />, {
      path: '/hosts/host-03',
    })
    await screen.findByRole('button', { name: 'Pinned to host' }, { timeout: FIND_TIMEOUT_MS })
    await user.click(screen.getByRole('button', { name: 'Pinned to host' }))
    expect(
      await screen.findByText(
        'No virtual machines are pinned to this host.',
        {},
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeDefined()
  })
})
