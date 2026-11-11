// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getVm, getVmAllContentDevices } from '../../api/resources/vms'
import type { Vm } from '../../api/schemas/vm'
import { setSessionToken } from '../../api/session'
import { FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EditVmModal } from './EditVmModal'

// The all_content device flags (serial console, sound card, VirtIO-SCSI, RNG)
// in the Edit VM modal against the mock engine, which serves them on
// all_content reads only, as the engine does. The modal is opened with the
// plain read, so every switch must come from the dedicated read. The
// transport is wrapped (EditVmModal.tpm.test.tsx pattern) to inspect the PUT.
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

// direct reads below run before the harness signs in
beforeEach(() => setSessionToken('tok-test'))

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

const vmPuts = () =>
  requestSpy.mock.calls
    .filter(([path, opts]) => {
      const method = (opts as { method?: string } | undefined)?.method
      return method === 'PUT' && /^\/vms\/[^/]+(\?.*)?$/.test(path)
    })
    .map(([path, opts]) => ({ path, body: (opts as { body?: unknown }).body as object }))

const DEVICE_KEYS = ['console', 'virtio_scsi', 'soundcard_enabled', 'rng_device', 'tpm_enabled']

// The plain read, as the VM details page hands it to the modal; Down so a
// save goes straight through.
async function plainRead(id: string): Promise<Vm> {
  return { ...(await getVm(id)), status: 'down' }
}

const tab = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(await screen.findByRole('tab', { name }, { timeout: FIND_TIMEOUT_MS }))

const control = async (role: 'switch' | 'checkbox', name: string) =>
  (await screen.findByRole(role, { name }, { timeout: FIND_TIMEOUT_MS })) as HTMLInputElement

describe('EditVmModal all_content device flags', () => {
  it('the mock serves the device flags on all_content reads only', async () => {
    const plain = await getVm('vm-01')
    for (const key of DEVICE_KEYS) expect(plain).not.toHaveProperty(key)
    await expect(getVmAllContentDevices('vm-01')).resolves.toMatchObject({
      serialConsoleEnabled: true,
      soundcardEnabled: true,
      virtioScsiEnabled: true,
    })
    await expect(getVmAllContentDevices('vm-02')).resolves.toMatchObject({
      rngDevice: { source: 'urandom', rate: { bytes: 32, period: 1000 } },
    })
  })

  it('seeds the switches from the all_content read and an untouched device stays out of the save', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={await plainRead('vm-01')} isOpen onClose={onClose} />)

    await tab(user, 'Console')
    const sound = await control('switch', 'Soundcard enabled')
    await waitFor(() => expect(sound.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })
    expect(sound.disabled).toBe(false)
    expect((await control('switch', 'Enable VirtIO serial console')).checked).toBe(true)
    await tab(user, 'Resource Allocation')
    expect((await control('switch', 'VirtIO-SCSI Enabled')).checked).toBe(true)

    // an unrelated change: none of the device keys ride the PUT
    await user.click(screen.getByRole('switch', { name: 'Memory Balloon Device Enabled' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(vmPuts()).toHaveLength(1)
    for (const key of DEVICE_KEYS) expect(vmPuts()[0]!.body).not.toHaveProperty(key)
    await expect(getVmAllContentDevices('vm-01')).resolves.toMatchObject({
      serialConsoleEnabled: true,
      soundcardEnabled: true,
      virtioScsiEnabled: true,
    })
  })

  it('sends only the device the user turned off', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={await plainRead('vm-01')} isOpen onClose={onClose} />)
    await tab(user, 'Console')
    const sound = await control('switch', 'Soundcard enabled')
    await waitFor(() => expect(sound.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })
    await user.click(sound)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    const body = vmPuts()[0]!.body
    expect(body).toMatchObject({ soundcard_enabled: false })
    for (const key of DEVICE_KEYS.filter((k) => k !== 'soundcard_enabled')) {
      expect(body).not.toHaveProperty(key)
    }
  })

  it('seeds the RNG device from the all_content read', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EditVmModal vm={await plainRead('vm-02')} isOpen onClose={vi.fn()} />)
    await tab(user, 'Random Generator')
    const rng = await control('checkbox', 'Enable Random Generator device')
    await waitFor(() => expect(rng.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })
    expect(rng.disabled).toBe(false)
    expect((screen.getByRole('spinbutton', { name: /Period/ }) as HTMLInputElement).value).toBe(
      '1000',
    )
  })

  it('keeps the device controls disabled while the read fails', async () => {
    requestSpy.mockImplementation((path, opts) =>
      path === '/vms/vm-01?all_content=true'
        ? Promise.reject(new Error('denied'))
        : passthrough.request!(path, opts),
    )
    const user = userEvent.setup()
    renderWithProviders(<EditVmModal vm={await plainRead('vm-01')} isOpen onClose={vi.fn()} />)
    expect(
      await screen.findByTestId('edit-vm-devices-error', undefined, { timeout: FIND_TIMEOUT_MS }),
    ).toBeDefined()
    await tab(user, 'Console')
    expect((await control('switch', 'Soundcard enabled')).disabled).toBe(true)
    expect((await control('switch', 'Enable VirtIO serial console')).disabled).toBe(true)
    await tab(user, 'Random Generator')
    expect((await control('checkbox', 'Enable Random Generator device')).disabled).toBe(true)

    // Retry recovers
    requestSpy.mockImplementation(passthrough.request!)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByTestId('edit-vm-devices-error')).toBeNull(), {
      timeout: FIND_TIMEOUT_MS,
    })
    await tab(user, 'Console')
    const sound = await control('switch', 'Soundcard enabled')
    expect(sound.disabled).toBe(false)
    expect(sound.checked).toBe(true)
  })
})
