// @vitest-environment jsdom
import '../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../test/render'
import { MacPoolsPage } from './MacPoolsPage'

// The transport is wrapped (not replaced): every request still lands in the
// mock engine, but a test can fail or reshape one path to drive the page's
// error and empty states — the fixtures themselves have no failure knob.
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

function overrideRequest(path: string, handler: () => Promise<unknown>): void {
  requestSpy.mockImplementation((p, opts) =>
    p === path ? handler() : passthrough.request!(p, opts),
  )
}

// PF's Table renders role="grid"; the header row is the first row.
const findGrid = () =>
  screen.findByRole('grid', { name: 'MAC address pools' }, { timeout: FIND_TIMEOUT_MS })
const bodyRows = (grid: HTMLElement) => within(grid).getAllByRole('row').slice(1)
const firstCellText = (row: HTMLElement) => row.querySelector('td')?.textContent

afterEach(() => {
  // restore pass-through AND forget the previous test's call history
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

describe('MacPoolsPage', () => {
  it('shows skeletons while the tier and list resolve, then the fixture pools', async () => {
    renderWithProviders(<MacPoolsPage />, { path: '/mac-pools' })

    // heading is up immediately; the grid is not
    await screen.findByRole('heading', { level: 1, name: 'MAC address pools' })
    expect(screen.getByText('Loading MAC address pools')).toBeDefined()
    expect(screen.queryByRole('grid')).toBeNull()

    const rows = bodyRows(await findGrid())
    expect(rows.map(firstCellText)).toEqual(['Default', 'lab-pool'])
    // the single range renders inline, and the yes/no column is coerced from
    // the mock's string boolean
    expect(within(rows[0]).getByText('56:6f:15:00:00:00 – 56:6f:15:ff:ff:ff')).toBeDefined()
    expect(within(rows[0]).getByText('No')).toBeDefined()
    expect(screen.getByRole('button', { name: 'New pool' })).toBeDefined()
    expect(screen.queryByText('Loading MAC address pools')).toBeNull()
  })

  it('filters rows client-side and offers a way back from a no-match filter', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MacPoolsPage />, { path: '/mac-pools' })
    await findGrid()

    const filter = screen.getByRole('textbox', { name: 'Filter MAC address pools by name' })
    await user.type(filter, 'lab')
    let rows = bodyRows(screen.getByRole('grid'))
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('lab-pool')

    await user.clear(filter)
    await user.type(filter, 'no-such-pool')
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByText('Nothing matches the filter')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Clear filter' }))
    rows = bodyRows(await findGrid())
    expect(rows).toHaveLength(2)
  })

  it('renders the empty state with a create call-to-action when the engine has no pools', async () => {
    overrideRequest('/macpools', () => Promise.resolve({ mac_pool: [] }))
    renderWithProviders(<MacPoolsPage />, { path: '/mac-pools' })

    await screen.findByText('No MAC address pools', undefined, { timeout: FIND_TIMEOUT_MS })
    expect(screen.getByText('MAC address pools defined on the engine appear here.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'New pool' })).toBeDefined()
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('renders the error state with the engine fault and recovers on Retry', async () => {
    const user = userEvent.setup()
    overrideRequest('/macpools', () =>
      Promise.reject(new ApiError(500, 'Operation Failed', 'Engine is on fire')),
    )
    renderWithProviders(<MacPoolsPage />, { path: '/mac-pools' })

    await screen.findByText('Could not load MAC address pools', undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(screen.getByText('Engine is on fire')).toBeDefined()
    expect(screen.queryByRole('grid')).toBeNull()

    // engine recovers; Retry refetches and the grid appears
    requestSpy.mockImplementation(passthrough.request!)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await findGrid()
    await waitFor(() => expect(screen.queryByText('Could not load MAC address pools')).toBeNull())
  })

  it('shows the permission lock instead of the list for a user-tier account', async () => {
    renderWithProviders(<MacPoolsPage />, { path: '/mac-pools', user: 'demo@internal' })

    await screen.findByText('You do not have permission to view MAC address pools', undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New pool' })).toBeNull()
    // the doomed admin-only read is never issued for a user-tier session
    expect(requestSpy.mock.calls.map(([path]) => path)).not.toContain('/macpools')
  })
})
