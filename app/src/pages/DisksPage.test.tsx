// @vitest-environment jsdom
import '../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../test/render'
import { DisksPage } from './DisksPage'

const findGrid = () => screen.findByRole('grid', { name: 'Disks' }, { timeout: FIND_TIMEOUT_MS })
const ovfRows = (grid: HTMLElement) => within(grid).queryAllByText('OVF_STORE')

describe('DisksPage — OVF_STORE filter', () => {
  it('hides the engine OVF_STORE disks by default and reveals them on request', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DisksPage />, { path: '/disks' })
    const grid = await findGrid()
    // the fixtures carry two OVF_STORE disks; none show while the box is checked
    await waitFor(() => expect(within(grid).getAllByRole('row').length).toBeGreaterThan(1))
    expect(ovfRows(grid)).toHaveLength(0)

    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Hide OVF_STORE disks' })
    expect(box.checked).toBe(true)
    await user.click(box)
    await waitFor(() => expect(ovfRows(grid)).toHaveLength(2))
    // the choice is durable per browser
    expect(localStorage.getItem('console-disks-hide-ovf-store')).toBe('false')

    await user.click(box)
    await waitFor(() => expect(ovfRows(grid)).toHaveLength(0))
  })

  it('starts unchecked when the browser remembered that choice', async () => {
    localStorage.setItem('console-disks-hide-ovf-store', 'false')
    renderWithProviders(<DisksPage />, { path: '/disks' })
    const grid = await findGrid()
    await waitFor(() => expect(ovfRows(grid)).toHaveLength(2))
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Hide OVF_STORE disks' }).checked,
    ).toBe(false)
  })
})
