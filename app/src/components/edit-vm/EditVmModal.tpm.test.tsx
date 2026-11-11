// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVmTpmEnabled } from '../../api/resources/vms'
import type { Vm } from '../../api/schemas/vm'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EditVmModal } from './EditVmModal'

// The Edit VM modal's TPM toggle (Resource Allocation) against the mock
// engine: seeded from the dedicated all_content read, gated by firmware and
// guest OS, and a save that removes a TPM is confirmed first. The transport is
// wrapped (EditVmModal.watchdog.test.tsx pattern) so a test can fail the read
// and inspect the PUT body.
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

// The bodies of every VM PUT sent so far, with the query string.
const vmPuts = () =>
  requestSpy.mock.calls
    .filter(([path, opts]) => {
      const method = (opts as { method?: string } | undefined)?.method
      return method === 'PUT' && /^\/vms\/[^/]+(\?.*)?$/.test(path)
    })
    .map(([path, opts]) => ({ path, body: (opts as { body?: unknown }).body }))

const GiB = 1024 * 1024 * 1024

// Read models for two mock fixtures: vm-06 (Windows Server 2022, UEFI with
// secure boot, carries a TPM) and vm-02 (RHEL 9 on the SeaBIOS cluster
// default, no TPM). The status only steers the modal's next-run path.
function vm06(status = 'down'): Vm {
  return {
    id: 'vm-06',
    name: 'win2022-ad',
    status,
    memory: 8 * GiB,
    memory_policy: { guaranteed: 8 * GiB, max: 32 * GiB },
    os: { type: 'windows_2022' },
    bios: { type: 'q35_secure_boot' },
    cluster: { id: 'cluster-01' },
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: 1, threads: 1 } },
  } as Vm
}

function vm02(status = 'down'): Vm {
  return {
    id: 'vm-02',
    name: 'web-02',
    status,
    memory: 4 * GiB,
    memory_policy: { guaranteed: 4 * GiB, max: 16 * GiB },
    os: { type: 'rhel_9x64' },
    cluster: { id: 'cluster-01' },
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: 1, threads: 1 } },
  } as Vm
}

const tab = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(await screen.findByRole('tab', { name }, { timeout: FIND_TIMEOUT_MS }))

// The TPM switch once the dedicated read has seeded it (a skeleton until then).
const tpmSwitch = async () =>
  (await screen.findByRole(
    'switch',
    { name: 'TPM Device Enabled' },
    { timeout: FIND_TIMEOUT_MS },
  )) as HTMLInputElement

describe('EditVmModal TPM device', () => {
  it('seeds from the all_content read and removes the device only after confirming', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vm06()} isOpen onClose={onClose} />)
    await tab(user, 'Resource Allocation')

    const toggle = await tpmSwitch()
    await waitFor(() => expect(toggle.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })
    expect(toggle.disabled).toBe(false)
    expect(requestSpy.mock.calls.some(([path]) => path === '/vms/vm-06?all_content=true')).toBe(
      true,
    )

    await user.click(toggle)
    expect(screen.getByTestId('tpm-removal-warning')).toBeDefined()

    // cancel keeps the modal and sends nothing
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('dialog', { name: /Remove VM TPM data/ })
    expect(dialog.textContent).toContain('win2022-ad')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(vmPuts()).toEqual([])
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(await screen.findByRole('button', { name: 'Remove TPM data' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(vmPuts()).toEqual([
      { path: '/vms/vm-06', body: expect.objectContaining({ tpm_enabled: false }) },
    ])
    await expect(getVmTpmEnabled('vm-06')).resolves.toBe(false)
  })

  it('confirms the removal ahead of the Next-Run question on a running VM', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vm06('up')} isOpen onClose={onClose} />)
    await tab(user, 'Resource Allocation')
    const toggle = await tpmSwitch()
    await waitFor(() => expect(toggle.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })
    await user.click(toggle)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(await screen.findByRole('button', { name: 'Remove TPM data' }))
    // the device lands at the next start even with Apply now
    expect(
      await screen.findByText(
        'The TPM change takes effect at the next start of the VM, even with Apply now.',
        undefined,
        { timeout: FIND_TIMEOUT_MS },
      ),
    ).toBeDefined()
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Apply after restart' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(vmPuts()).toEqual([
      {
        path: '/vms/vm-06?next_run=true',
        body: expect.objectContaining({ tpm_enabled: false }),
      },
    ])
  })

  it('sends tpm_enabled false when a switch away from UEFI leaves the TPM unsupported', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vm06()} isOpen onClose={onClose} />)
    await tab(user, 'Resource Allocation')
    const toggle = await tpmSwitch()
    await waitFor(() => expect(toggle.checked).toBe(true), { timeout: FIND_TIMEOUT_MS })

    await tab(user, 'General')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Chipset/Firmware type' }),
      'q35_sea_bios',
    )
    await tab(user, 'Resource Allocation')
    const gated = await tpmSwitch()
    expect(gated.checked).toBe(false)
    expect(gated.disabled).toBe(true)
    expect(screen.getByText('Available only with UEFI firmware')).toBeDefined()
    expect(screen.getByTestId('tpm-removal-warning')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(await screen.findByRole('button', { name: 'Remove TPM data' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    // the engine refuses a body that keeps quiet about the now-unsupported device
    expect(vmPuts()).toEqual([
      {
        path: '/vms/vm-06',
        body: expect.objectContaining({
          tpm_enabled: false,
          bios: expect.objectContaining({ type: 'q35_sea_bios' }),
        }),
      },
    ])
    await expect(getVmTpmEnabled('vm-06')).resolves.toBe(false)
  })

  it('is disabled with the reason on SeaBIOS and enables once UEFI is picked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vm02()} isOpen onClose={onClose} />)
    await tab(user, 'Resource Allocation')
    const toggle = await tpmSwitch()
    // cluster default firmware on cluster-01 is Q35 with SeaBIOS
    await waitFor(
      () => expect(screen.getByText('Available only with UEFI firmware')).toBeDefined(),
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(toggle.disabled).toBe(true)
    expect(toggle.checked).toBe(false)

    await tab(user, 'General')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Chipset/Firmware type' }),
      'q35_ovmf',
    )
    await tab(user, 'Resource Allocation')
    const enabled = await tpmSwitch()
    expect(enabled.disabled).toBe(false)
    expect(screen.queryByText('Available only with UEFI firmware')).toBeNull()
    await user.click(enabled)
    expect(screen.queryByTestId('tpm-removal-warning')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByRole('dialog', { name: /Remove VM TPM data/ })).toBeNull()
    expect(vmPuts()).toEqual([
      { path: '/vms/vm-02', body: expect.objectContaining({ tpm_enabled: true }) },
    ])
    await expect(getVmTpmEnabled('vm-02')).resolves.toBe(true)
  })

  it('forces the TPM on for a guest OS that requires one', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vm02()} isOpen onClose={onClose} />)
    await tab(user, 'General')
    await user.selectOptions(
      await screen
        .findByRole('option', { name: 'Windows 11' }, { timeout: FIND_TIMEOUT_MS })
        .then((option) => option.closest('select') as HTMLSelectElement),
      'windows_11',
    )
    await tab(user, 'Resource Allocation')
    // still SeaBIOS: the reason names the OS requirement and the firmware
    await waitFor(
      () =>
        expect(
          screen.getByText(
            'The guest OS requires a TPM device, which is available only with UEFI firmware',
          ),
        ).toBeDefined(),
      { timeout: FIND_TIMEOUT_MS },
    )

    await tab(user, 'General')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Chipset/Firmware type' }),
      'q35_ovmf',
    )
    await tab(user, 'Resource Allocation')
    const toggle = await tpmSwitch()
    expect(toggle.checked).toBe(true)
    expect(toggle.disabled).toBe(true)
    expect(screen.getByText('TPM device is required by the guest OS')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(vmPuts()).toEqual([
      {
        path: '/vms/vm-02',
        body: expect.objectContaining({ tpm_enabled: true, os: expect.anything() }),
      },
    ])
  })

  it('keeps the toggle disabled and tpm_enabled out of the save when the read fails', async () => {
    requestSpy.mockImplementation((path, opts) =>
      path === '/vms/vm-06?all_content=true'
        ? Promise.reject(new ApiError(403, 'Forbidden', 'denied'))
        : passthrough.request!(path, opts),
    )
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vm06()} isOpen onClose={onClose} />)
    await tab(user, 'Resource Allocation')
    expect(
      await screen.findByText(/Could not load the TPM device/, undefined, {
        timeout: FIND_TIMEOUT_MS,
      }),
    ).toBeDefined()
    expect((await tpmSwitch()).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined()

    await user.click(screen.getByRole('switch', { name: 'Memory Balloon Device Enabled' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(vmPuts()).toHaveLength(1)
    expect(vmPuts()[0]!.body).not.toHaveProperty('tpm_enabled')
    requestSpy.mockImplementation(passthrough.request!)
    await expect(getVmTpmEnabled('vm-06')).resolves.toBe(true)
  })
})
