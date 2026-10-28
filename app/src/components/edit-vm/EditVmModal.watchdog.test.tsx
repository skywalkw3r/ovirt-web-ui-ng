// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetVmRouteMocks } from '../../api/mock/routes/vm'
import { listVmWatchdogs } from '../../api/resources/watchdogs'
import type { Vm } from '../../api/schemas/vm'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EditVmModal } from './EditVmModal'

// The transport is wrapped, not replaced (MacPoolsPage.test.tsx pattern): every
// request still lands in the mock engine, but a test can fail one call and
// read back which calls were sent.
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

// "METHOD path" of every request so far, for asserting what a save sent
const sent = () =>
  requestSpy.mock.calls.map(
    ([path, opts]) => `${(opts as { method?: string } | undefined)?.method ?? 'GET'} ${path}`,
  )
const writes = () => sent().filter((call) => !call.startsWith('GET'))

// Drives the Edit VM modal against the mock engine: the HA tab's watchdog
// selects seed from GET /vms/{id}/watchdogs, and Save reconciles the device
// through the subcollection after the VM PUT. The resulting device state is
// read back through the resource (same mock engine) rather than spying calls.

const GiB = 1024 * 1024 * 1024

// Minimal read models for two mock fixtures: vm-02 carries a watchdog in the
// mock (routes/vm.ts) and runs; vm-05 has none and is treated as down.
function vmFixture(id: string, name: string, status: string): Vm {
  return {
    id,
    name,
    status,
    memory: 4 * GiB,
    memory_policy: { guaranteed: 4 * GiB, max: 16 * GiB },
    cluster: { id: 'cluster-01' },
    cpu: { architecture: 'x86_64', topology: { sockets: 1, cores: 1, threads: 1 } },
  } as Vm
}

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
  resetVmRouteMocks()
})

async function openHaTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('tab', { name: 'High Availability' }, { timeout: FIND_TIMEOUT_MS }),
  )
}

const modelSelect = () =>
  screen.findByRole('combobox', { name: 'Watchdog model' }, { timeout: FIND_TIMEOUT_MS })

describe('EditVmModal watchdog', () => {
  it('seeds the loaded device and removes it through the Next-Run path on a running VM', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-02', 'web-02', 'up')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)

    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).value).toBe('i6300esb'))
    const action = screen.getByRole('combobox', { name: 'Watchdog action' })
    expect((action as HTMLSelectElement).value).toBe('reset')
    // x86_64 only offers the PCI model (plus "No watchdog")
    expect(
      within(model)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No watchdog', 'i6300esb'])

    await user.selectOptions(model, '')
    expect((action as HTMLSelectElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // a watchdog change on a running VM is next-run, and the dialog says the
    // device lands at the next start even with Apply now
    expect(
      await screen.findByText(
        'The watchdog change takes effect at the next start of the VM, even with Apply now.',
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
    await expect(listVmWatchdogs('vm-02')).resolves.toEqual([])
  })

  it('adds a watchdog to a VM that has none, saving straight through when down', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-05', 'vm-05', 'down')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)

    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).disabled).toBe(false))
    expect((model as HTMLSelectElement).value).toBe('')
    await user.selectOptions(model, 'i6300esb')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Watchdog action' }), 'poweroff')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(screen.queryByRole('button', { name: 'Apply after restart' })).toBeNull()
    await expect(listVmWatchdogs('vm-05')).resolves.toEqual([
      expect.objectContaining({ model: 'i6300esb', action: 'poweroff' }),
    ])
  })

  // Pins the save order: the watchdog subcollection call lands BEFORE the vm
  // PUT, so a NEXT_RUN snapshot the PUT creates captures the new device.
  it('applies the watchdog before the vm PUT (down VM, plain PUT)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-05', 'vm-05', 'down')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)
    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).disabled).toBe(false))
    await user.click(screen.getByRole('switch', { name: 'Highly available' }))
    await user.selectOptions(model, 'i6300esb')
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(writes()).toEqual(['POST /vms/vm-05/watchdogs', 'PUT /vms/vm-05'])
  })

  it('applies the watchdog before the next_run PUT on a running VM', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-02', 'web-02', 'up')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)
    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).value).toBe('i6300esb'))
    await user.click(screen.getByRole('switch', { name: 'Highly available' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Watchdog action' }), 'pause')
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Apply after restart' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(writes()).toEqual([
      'PUT /vms/vm-02/watchdogs/vm-02-watchdog',
      'PUT /vms/vm-02?next_run=true',
    ])
  })

  it('refreshes a pending next-run configuration after a watchdog-only save', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const vm = { ...vmFixture('vm-02', 'web-02', 'up'), next_run_configuration_exists: true }
    renderWithProviders(<EditVmModal vm={vm} isOpen onClose={onClose} />)
    await openHaTab(user)
    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).value).toBe('i6300esb'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Watchdog action' }), 'dump')
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(
      await screen.findByRole('button', { name: 'Apply now' }, { timeout: FIND_TIMEOUT_MS }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    // the minimal next_run PUT re-creates the snapshot with the new device
    expect(writes()).toEqual([
      'PUT /vms/vm-02/watchdogs/vm-02-watchdog',
      'PUT /vms/vm-02?next_run=true',
    ])
    const refresh = requestSpy.mock.calls.find(([path]) => path === '/vms/vm-02?next_run=true')
    expect(refresh).toBeDefined()
    expect((refresh![1] as { body?: unknown }).body).toEqual({})
  })

  it('without a pending next-run configuration, a watchdog-only save sends only the device', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-02', 'web-02', 'up')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)
    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).value).toBe('i6300esb'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Watchdog action' }), 'dump')
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(
      await screen.findByRole('button', { name: 'Apply now' }, { timeout: FIND_TIMEOUT_MS }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(writes()).toEqual(['PUT /vms/vm-02/watchdogs/vm-02-watchdog'])
  })

  it('a failed watchdog step saves nothing and keeps the modal open', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    let failWatchdog = true
    requestSpy.mockImplementation((path, opts) =>
      failWatchdog &&
      path === '/vms/vm-05/watchdogs' &&
      (opts as { method?: string } | undefined)?.method === 'POST'
        ? Promise.reject(new ApiError(409, 'Conflict', 'watchdog refused'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-05', 'vm-05', 'down')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)
    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).disabled).toBe(false))
    await user.click(screen.getByRole('switch', { name: 'Highly available' }))
    await user.selectOptions(model, 'i6300esb')
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText(
      'The watchdog change failed, so nothing was saved: watchdog refused. Save again to retry.',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(writes()).toEqual(['POST /vms/vm-05/watchdogs'])

    failWatchdog = false
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(writes()).toEqual(['POST /vms/vm-05/watchdogs', 'PUT /vms/vm-05'])
  })

  it('a failed next-run refresh keeps the modal open and the retry only refreshes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    let failRefresh = true
    requestSpy.mockImplementation((path, opts) =>
      failRefresh && path === '/vms/vm-02?next_run=true'
        ? Promise.reject(new ApiError(409, 'Conflict', 'vm is locked'))
        : passthrough.request!(path, opts),
    )
    const vm = { ...vmFixture('vm-02', 'web-02', 'up'), next_run_configuration_exists: true }
    renderWithProviders(<EditVmModal vm={vm} isOpen onClose={onClose} />)
    await openHaTab(user)
    const model = await modelSelect()
    await waitFor(() => expect((model as HTMLSelectElement).value).toBe('i6300esb'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Watchdog action' }), 'pause')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(
      await screen.findByRole('button', { name: 'Apply now' }, { timeout: FIND_TIMEOUT_MS }),
    )
    await screen.findByText(
      "The watchdog was saved, but the VM's pending next-run configuration was not refreshed, so the engine could undo the change at the next shutdown: vm is locked. Save again to retry.",
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(onClose).not.toHaveBeenCalled()

    failRefresh = false
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    // the device already landed: no second watchdog call, no Next-Run dialog
    expect(writes()).toEqual(['PUT /vms/vm-02?next_run=true'])
    expect(screen.queryByRole('button', { name: 'Apply now' })).toBeNull()
  })

  it('a failed CD change keeps the modal open and the retry only sends the CD', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    let failCd = true
    requestSpy.mockImplementation((path, opts) =>
      failCd &&
      path.startsWith('/vms/vm-05/cdroms/') &&
      (opts as { method?: string } | undefined)?.method === 'PUT'
        ? Promise.reject(new ApiError(500, 'Operation Failed', 'no such ISO'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(
      <EditVmModal vm={vmFixture('vm-05', 'vm-05', 'down')} isOpen onClose={onClose} />,
    )
    await openHaTab(user)
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Watchdog model' }) as HTMLSelectElement).disabled,
      ).toBe(false),
    )
    await user.click(screen.getByRole('switch', { name: 'Highly available' }))
    await user.click(screen.getByRole('tab', { name: 'Boot Options' }))
    const cd = await screen.findByRole('combobox', { name: 'Attach CD' })
    await waitFor(() => expect((cd as HTMLSelectElement).disabled).toBe(false), {
      timeout: FIND_TIMEOUT_MS,
    })
    const iso = within(cd)
      .getAllByRole('option')
      .find((option) => (option as HTMLOptionElement).value !== '') as HTMLOptionElement
    await user.selectOptions(cd, iso.value)
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText(
      'The VM was saved, but the CD change failed: no such ISO. Save again to retry.',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(writes()).toEqual([
      'PUT /vms/vm-05',
      'PUT /vms/vm-05/cdroms/00000000-0000-0000-0000-000000000000',
    ])

    failCd = false
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(writes()).toEqual(['PUT /vms/vm-05/cdroms/00000000-0000-0000-0000-000000000000'])
  })
})
