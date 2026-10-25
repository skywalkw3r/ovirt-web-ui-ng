// @vitest-environment jsdom
import '../../test/env'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { NicLldpModal, NicLldpPopoverButton } from './NicLldp'

// The transport is wrapped (not replaced): requests land in the mock engine
// unless a test reshapes one path to drive the error state.
type Request = (path: string, opts?: unknown) => Promise<unknown>
const { requestSpy, passthrough } = vi.hoisted(() => ({
  requestSpy: vi.fn<(path: string, opts?: unknown) => Promise<unknown>>(),
  passthrough: { request: null as ((path: string, opts?: unknown) => Promise<unknown>) | null },
}))
vi.mock('../../api/transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/transport')>()
  passthrough.request = actual.request as Request
  requestSpy.mockImplementation(actual.request as Request)
  return { ...actual, request: requestSpy }
})

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

const lldpReads = () =>
  requestSpy.mock.calls.filter(([path]) => path.endsWith('/linklayerdiscoveryprotocolelements'))

describe('NicLldpModal', () => {
  it('lists the reported elements as name/value lines', async () => {
    renderWithProviders(
      <NicLldpModal hostId="host-01" nicId="host-01-nic-eno2" nicName="eno2" onClose={() => {}} />,
    )
    expect(
      await screen.findByText(
        'port description: Summit300-48-Port 1001',
        {},
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeDefined()
    expect(screen.getByText('Port VLAN Id')).toBeDefined()
    expect(screen.getByText('vlan name: v2-0488-03-0505')).toBeDefined()
  })

  it('says so when the NIC reported nothing', async () => {
    renderWithProviders(
      <NicLldpModal hostId="host-01" nicId="host-01-nic-eno3" nicName="eno3" onClose={() => {}} />,
    )
    expect(
      await screen.findByText('No LLDP data reported', {}, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
  })

  it('shows the engine error with a retry', async () => {
    requestSpy.mockImplementation((path, opts) =>
      path.endsWith('/linklayerdiscoveryprotocolelements')
        ? Promise.reject(new ApiError(409, 'Operation Failed', 'VDSM node-01 command failed'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(
      <NicLldpModal hostId="host-01" nicId="host-01-nic-eno2" nicName="eno2" onClose={() => {}} />,
    )
    expect(
      await screen.findByText('Could not load LLDP information', {}, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
    expect(screen.getByText('VDSM node-01 command failed')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined()
  })
})

describe('NicLldpPopoverButton', () => {
  it('fetches only once the popover is opened', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <NicLldpPopoverButton hostId="host-01" nicId="host-01-nic-eno1" nicName="eno1" />,
    )
    const trigger = await screen.findByRole(
      'button',
      { name: 'Show LLDP information for eno1' },
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(lldpReads()).toHaveLength(0)

    await user.click(trigger)
    expect(
      await screen.findByText('system name: tor-sw-01.lab.local', {}, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
    expect(lldpReads()).toHaveLength(1)
  })
})
