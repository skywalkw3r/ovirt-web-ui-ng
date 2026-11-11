// @vitest-environment jsdom
import '../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PaletteDialog } from '../components/PaletteDialog'
import { FIND_TIMEOUT_MS, renderRoute, renderWithProviders } from '../test/render'
import { ConfigurePage } from './ConfigurePage'

const findList = () =>
  screen.findByRole('list', { name: 'Configuration areas' }, { timeout: FIND_TIMEOUT_MS })

describe('ConfigurePage', () => {
  it('links to the five webadmin Configure surfaces, in webadmin order', async () => {
    renderWithProviders(<ConfigurePage />, { path: '/configure' })

    // heading is up immediately; the cards wait for the tier
    await screen.findByRole('heading', { level: 1, name: 'Configure' })
    expect(screen.getByText('Loading configuration areas')).toBeDefined()

    const items = within(await findList()).getAllByRole('listitem')
    const links = items.map((item) => within(item).getByRole('link'))
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Roles', '/roles'],
      ['System Permissions', '/system-permissions'],
      ['Scheduling Policies', '/scheduling-policies'],
      ['Instance Types', '/instance-types'],
      ['MAC Address Pools', '/mac-pools'],
    ])
    // each card carries its own heading and a short description
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5)
    expect(
      within(items[4]).getByText('Manage the MAC address ranges assigned to virtual NICs.'),
    ).toBeDefined()
    expect(screen.queryByText('Loading configuration areas')).toBeNull()
  })

  it('navigates to the linked page instead of embedding it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConfigurePage />, { path: '/configure' })
    await findList()

    await user.click(screen.getByRole('link', { name: 'Scheduling Policies' }))
    await waitFor(() =>
      expect(screen.getByTestId('harness-location').textContent).toContain('/scheduling-policies'),
    )
  })

  it('shows the permission lock and no links for a user-tier account', async () => {
    renderWithProviders(<ConfigurePage />, { path: '/configure', user: 'demo@internal' })

    await screen.findByText('You do not have permission to view system configuration', undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Configure' })).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Configuration areas' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Roles' })).toBeNull()
  })

  it('is routed at /configure with a sidebar entry under Administration', async () => {
    await renderRoute('/configure')

    await findList()
    const entry = await screen.findByRole('link', { name: 'Configure' })
    expect(entry.closest('nav')).not.toBeNull()
    expect(entry.getAttribute('href')).toBe('/configure')
    // the five surfaces keep their own sidebar entries beside the cards
    for (const name of [
      'Roles',
      'System Permissions',
      'Scheduling Policies',
      'MAC Address Pools',
    ]) {
      const inNav = screen
        .getAllByRole('link', { name })
        .filter((link) => link.closest('nav') !== null)
      expect(inNav, name).toHaveLength(1)
    }
  })
})

describe('command palette Configure destination', () => {
  it('offers Configure to admins', async () => {
    renderWithProviders(<PaletteDialog onClose={() => {}} />)
    expect(
      await screen.findByRole('option', { name: 'Configure' }, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
  })

  it('hides Configure from user-tier accounts', async () => {
    renderWithProviders(<PaletteDialog onClose={() => {}} />, { user: 'demo@internal' })
    await screen.findByRole('option', { name: 'Dashboard' }, { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByRole('option', { name: 'Configure' })).toBeNull()
  })
})
