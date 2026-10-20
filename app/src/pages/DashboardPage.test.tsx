// @vitest-environment jsdom
import '../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../test/render'
import { DashboardPage } from './DashboardPage'

// The transport is wrapped (not replaced): every request still lands in the
// mock engine, but one collection can be failed to prove the cards are
// isolated from each other — the fixtures have no failure knob of their own.
type Request = (path: string, opts?: unknown) => Promise<unknown>
const { requestSpy, passthrough } = vi.hoisted(() => ({
  requestSpy: vi.fn<(path: string, opts?: unknown) => Promise<unknown>>(),
  passthrough: { request: null as ((path: string, opts?: unknown) => Promise<unknown>) | null },
}))
vi.mock('../api/transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/transport')>()
  passthrough.request = actual.request as Request
  requestSpy.mockImplementation(actual.request as Request)
  return { ...actual, request: requestSpy }
})

function failCollection(prefix: string, error: Error): void {
  requestSpy.mockImplementation((path, opts) =>
    path.startsWith(prefix) ? Promise.reject(error) : passthrough.request!(path, opts),
  )
}
const requested = () => requestSpy.mock.calls.map(([path]) => path)

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

describe('DashboardPage', () => {
  it('renders every card from its skeleton into the fixture data', async () => {
    renderWithProviders(<DashboardPage />)

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    // loading: each card announces its own skeleton
    expect(screen.getByText('Loading virtual machines')).toBeDefined()
    expect(screen.getByText('Loading engine information')).toBeDefined()
    expect(screen.getByText('Loading events')).toBeDefined()
    expect(screen.getByText('Loading storage domains')).toBeDefined()

    // populated — Details
    await screen.findByText('oVirt Engine (mock)', undefined, { timeout: FIND_TIMEOUT_MS })
    expect(screen.getByText('4.5.7-mock')).toBeDefined()
    expect(screen.getByText('admin@internal')).toBeDefined()
    await screen.findByText('Admin', undefined, { timeout: FIND_TIMEOUT_MS })

    // Storage: the four fullest domains, fullest first
    const storage = await screen.findByRole(
      'list',
      { name: 'Storage domain capacity' },
      { timeout: FIND_TIMEOUT_MS },
    )
    const domains = within(storage).getAllByRole('listitem')
    expect(domains).toHaveLength(4)
    expect(domains[0].textContent).toContain('data')
    expect(screen.getByRole('link', { name: 'View storage domains' })).toBeDefined()

    // Activity: the four newest audit lines, newest first (ev-15 in the fixture)
    const activity = await screen.findByRole(
      'region',
      { name: 'Latest events' },
      {
        timeout: FIND_TIMEOUT_MS,
      },
    )
    const lines = within(activity).getAllByRole('listitem')
    expect(lines).toHaveLength(4)
    expect(lines[0].textContent).toContain('User admin@internal logged out.')
    expect(screen.getByRole('link', { name: 'View all events' })).toBeDefined()

    // Inventory + VM status chart
    const inventory = screen.getByRole('list', { name: 'Resource inventory' })
    await within(inventory).findByText('10 Virtual machines', undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    // the admin-only hosts row rides its own (slower-cadence) query
    await within(inventory).findByText(/^\d+ Hosts$/, undefined, { timeout: FIND_TIMEOUT_MS })
    expect(screen.getByText('Virtual machines by status')).toBeDefined()
    expect(screen.getByRole('link', { name: 'View virtual machines' })).toBeDefined()

    // every skeleton has been replaced
    await waitFor(() => expect(screen.queryByText(/^Loading /)).toBeNull(), {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(screen.queryByText(/^Could not load/)).toBeNull()
  })

  it('confines a failing collection to its own card and recovers it on Retry', async () => {
    const user = userEvent.setup()
    failCollection('/events', new ApiError(503, 'Service Unavailable', 'Engine is restarting'))
    renderWithProviders(<DashboardPage />)

    await screen.findByText('Could not load events', undefined, { timeout: FIND_TIMEOUT_MS })
    expect(screen.getByText('Engine is restarting')).toBeDefined()
    // the neighbours are unaffected
    await screen.findByText('oVirt Engine (mock)', undefined, { timeout: FIND_TIMEOUT_MS })
    const storage = await screen.findByRole(
      'list',
      { name: 'Storage domain capacity' },
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(within(storage).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)

    // engine back: Retry refetches only the failed feed
    requestSpy.mockImplementation(passthrough.request!)
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByText('User admin@internal logged out.', undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(screen.queryByText('Could not load events')).toBeNull()
  })

  it('never issues the admin-only host reads for a user-tier session and hides their rows', async () => {
    renderWithProviders(<DashboardPage />, { user: 'demo@internal' })

    await screen.findByText('Standard user', undefined, { timeout: FIND_TIMEOUT_MS })
    expect(screen.getByText('demo@internal')).toBeDefined()
    const inventory = screen.getByRole('list', { name: 'Resource inventory' })
    await within(inventory).findByText('10 Virtual machines', undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(within(inventory).queryByText(/Hosts$/)).toBeNull()
    expect(within(inventory).queryByText(/Data centers$/)).toBeNull()
    expect(requested().some((path) => path.startsWith('/hosts'))).toBe(false)
  })
})
