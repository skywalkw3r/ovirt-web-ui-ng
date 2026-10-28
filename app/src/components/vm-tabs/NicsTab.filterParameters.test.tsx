// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetVmRouteMocks } from '../../api/mock/routes/vm'
import { listNicNetworkFilterParameters } from '../../api/resources/nicNetworkFilterParameters'
import { listVmNics } from '../../api/resources/nics'
import type { Nic } from '../../api/schemas/nic'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { NicModal, NicsTab, type NicFormValues } from './NicsTab'

// The vNIC dialog's network filter parameter editor against the mock engine
// (routes/vm.ts seeds IP + CTRL_IP_LEARNING on vm-03's first NIC; vNIC profile
// vnic-03 "vm-prod-mirrored" carries a network filter). The transport is
// wrapped, not replaced, so one test can fail the parameter read.
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
  resetVmRouteMocks()
})

// "METHOD path" of every request so far, for asserting what a save sent
const sent = () =>
  requestSpy.mock.calls.map(
    ([path, opts]) => `${(opts as { method?: string } | undefined)?.method ?? 'GET'} ${path}`,
  )
const writes = () => sent().filter((call) => !call.startsWith('GET'))

const VM03_NIC: Nic = { id: 'vm-03-nic-1', name: 'nic1', interface: 'virtio' }

const nameInput = (index: number) =>
  screen.getByRole('textbox', { name: `Network filter parameter ${index} name` })
const valueInput = (index: number) =>
  screen.getByRole('textbox', { name: `Network filter parameter ${index} value` })

describe('NicModal network filter parameters', () => {
  it('seeds the loaded rows and submits a remove / update / add plan', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(values: NicFormValues) => void>()
    renderWithProviders(
      <NicModal nic={VM03_NIC} vmId="vm-03" onSubmit={onSubmit} onClose={() => {}} />,
    )

    await screen.findByRole(
      'textbox',
      { name: 'Network filter parameter 1 name' },
      { timeout: FIND_TIMEOUT_MS },
    )
    expect((nameInput(1) as HTMLInputElement).value).toBe('IP')
    expect((valueInput(1) as HTMLInputElement).value).toBe('10.0.0.13')
    expect((nameInput(2) as HTMLInputElement).value).toBe('CTRL_IP_LEARNING')

    await user.clear(valueInput(1))
    await user.type(valueInput(1), '10.0.0.99')
    await user.click(screen.getByRole('button', { name: 'Remove network filter parameter 2' }))
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    await user.type(nameInput(2), 'DHCPSERVER')
    await user.type(valueInput(2), '10.0.0.254')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0].networkFilterParameterPlan).toEqual({
      remove: ['nfp-02'],
      update: [{ id: 'nfp-01', name: 'IP', value: '10.0.0.99' }],
      add: [{ name: 'DHCPSERVER', value: '10.0.0.254' }],
    })
  })

  it('leaves the parameters untouched when nothing changed', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(values: NicFormValues) => void>()
    renderWithProviders(
      <NicModal nic={VM03_NIC} vmId="vm-03" onSubmit={onSubmit} onClose={() => {}} />,
    )
    await screen.findByRole(
      'textbox',
      { name: 'Network filter parameter 1 name' },
      { timeout: FIND_TIMEOUT_MS },
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls[0]?.[0].networkFilterParameterPlan).toBeUndefined()
  })

  it('shows the read error with Retry and never diffs an unread set', async () => {
    const user = userEvent.setup()
    const path = '/vms/vm-03/nics/vm-03-nic-1/networkfilterparameters'
    requestSpy.mockImplementation((p, opts) =>
      p === path
        ? Promise.reject(new ApiError(500, 'Operation Failed', 'filter read failed'))
        : passthrough.request!(p, opts),
    )
    const onSubmit = vi.fn<(values: NicFormValues) => void>()
    // A NIC on a filtered profile, so the editor shows even with no rows read.
    renderWithProviders(
      <NicModal
        nic={{ ...VM03_NIC, vnic_profile: { id: 'vnic-03' } }}
        vmId="vm-03"
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    )
    await screen.findByText(
      'Could not load network filter parameters: filter read failed',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(screen.queryByRole('button', { name: 'Add parameter' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls[0]?.[0].networkFilterParameterPlan).toBeUndefined()

    // the engine recovers: Retry loads and seeds the rows
    requestSpy.mockImplementation(passthrough.request!)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole(
      'textbox',
      { name: 'Network filter parameter 1 name' },
      { timeout: FIND_TIMEOUT_MS },
    )
  })

  it('offers no editor on a template NIC (no vmId)', async () => {
    renderWithProviders(<NicModal onSubmit={() => {}} onClose={() => {}} />)
    const profile = await screen.findByRole(
      'combobox',
      { name: 'vNIC profile' },
      { timeout: FIND_TIMEOUT_MS },
    )
    await userEvent.setup().selectOptions(profile, 'vnic-03')
    expect(screen.queryByText('Network filter parameters')).toBeNull()
  })
})

describe('NicsTab add with network filter parameters', () => {
  it('shows the editor for a filtered profile and creates the rows after the NIC', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NicsTab vmId="vm-01" />)

    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Add network interface' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'nic-filtered')

    const profile = await within(dialog).findByRole(
      'combobox',
      { name: 'vNIC profile' },
      { timeout: FIND_TIMEOUT_MS },
    )
    // a profile without a network filter hides the editor
    await user.selectOptions(profile, 'vnic-02')
    expect(within(dialog).queryByRole('button', { name: 'Add parameter' })).toBeNull()
    await user.selectOptions(profile, 'vnic-03')
    expect(within(dialog).getByText('No network filter parameters.')).toBeDefined()

    await user.click(within(dialog).getByRole('button', { name: 'Add parameter' }))
    await user.type(nameInput(1), 'IP')
    await user.type(valueInput(1), '10.0.0.50')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(
      async () => {
        const created = (await listVmNics('vm-01')).find((nic) => nic.name === 'nic-filtered')
        expect(created).toBeDefined()
        const parameters = await listNicNetworkFilterParameters('vm-01', created!.id)
        expect(parameters.map((p) => [p.name, p.value])).toEqual([['IP', '10.0.0.50']])
      },
      { timeout: FIND_TIMEOUT_MS },
    )
  })
})

describe('NicsTab partial save failures', () => {
  const PARAMS = '/vms/vm-03/nics/vm-03-nic-1/networkfilterparameters'

  it('keeps Edit open when the NIC saved but a parameter did not, then retries only that', async () => {
    const user = userEvent.setup()
    let failParameters = true
    requestSpy.mockImplementation((path, opts) =>
      failParameters && path === `${PARAMS}/nfp-01`
        ? Promise.reject(new ApiError(500, 'Operation Failed', 'nwfilter busy'))
        : passthrough.request!(path, opts),
    )
    renderWithProviders(<NicsTab vmId="vm-03" />)
    await user.click(
      await screen.findByRole('button', { name: 'Actions for nic1' }, { timeout: FIND_TIMEOUT_MS }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole(
      'textbox',
      { name: 'Network filter parameter 1 name' },
      { timeout: FIND_TIMEOUT_MS },
    )
    // a NIC field and a parameter
    await user.click(within(dialog).getByRole('switch', { name: /Linked/ }))
    await user.clear(valueInput(1))
    await user.type(valueInput(1), '10.0.0.99')
    requestSpy.mockClear()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await within(dialog).findByText(
      'The network interface was saved, but its network filter parameters were not: nwfilter busy. Save again to retry.',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(writes()).toEqual(['PUT /vms/vm-03/nics/vm-03-nic-1', `PUT ${PARAMS}/nfp-01`])

    failParameters = false
    requestSpy.mockClear()
    await waitFor(() =>
      expect(
        (within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), {
      timeout: FIND_TIMEOUT_MS,
    })
    // the NIC patch is not re-sent
    expect(writes()).toEqual([`PUT ${PARAMS}/nfp-01`])
    const parameters = await listNicNetworkFilterParameters('vm-03', 'vm-03-nic-1')
    expect(parameters.find((p) => p.id === 'nfp-01')?.value).toBe('10.0.0.99')
  })

  it('flips a failed Add to editing the created NIC, so a retry never duplicates it', async () => {
    const user = userEvent.setup()
    let failSecond = true
    requestSpy.mockImplementation((path, opts) => {
      const request = opts as { method?: string; body?: { name?: string } } | undefined
      return failSecond &&
        request?.method === 'POST' &&
        path.endsWith('/networkfilterparameters') &&
        request.body?.name === 'DHCPSERVER'
        ? Promise.reject(new ApiError(400, 'Bad Request', 'bad DHCPSERVER'))
        : passthrough.request!(path, opts)
    })
    renderWithProviders(<NicsTab vmId="vm-01" />)
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Add network interface' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'nic-filtered')
    await user.selectOptions(
      await within(dialog).findByRole(
        'combobox',
        { name: 'vNIC profile' },
        { timeout: FIND_TIMEOUT_MS },
      ),
      'vnic-03',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add parameter' }))
    await user.type(nameInput(1), 'IP')
    await user.type(valueInput(1), '10.0.0.50')
    await user.click(within(dialog).getByRole('button', { name: 'Add parameter' }))
    await user.type(nameInput(2), 'DHCPSERVER')
    await user.type(valueInput(2), '10.0.0.254')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await within(dialog).findByText(
      'The network interface was saved, but its network filter parameters were not: bad DHCPSERVER. Save again to retry.',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    // the same dialog now edits the created NIC, typed rows intact
    expect(within(dialog).getByText('Edit nic-filtered')).toBeDefined()
    expect((nameInput(2) as HTMLInputElement).value).toBe('DHCPSERVER')

    failSecond = false
    requestSpy.mockClear()
    const save = within(dialog).getByRole('button', { name: 'Save' })
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), {
      timeout: FIND_TIMEOUT_MS,
    })
    await user.click(save)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), {
      timeout: FIND_TIMEOUT_MS,
    })
    // no second NIC POST, and the landed IP row is not re-added
    expect(writes()).toEqual([
      expect.stringMatching(/^POST \/vms\/vm-01\/nics\/[^/]+\/networkfilterparameters$/),
    ])
    const created = (await listVmNics('vm-01')).filter((nic) => nic.name === 'nic-filtered')
    expect(created).toHaveLength(1)
    const parameters = await listNicNetworkFilterParameters('vm-01', created[0]!.id)
    expect(parameters.map((p) => [p.name, p.value])).toEqual([
      ['IP', '10.0.0.50'],
      ['DHCPSERVER', '10.0.0.254'],
    ])
  })

  it('never re-creates the NIC when the post-Add lookup itself failed', async () => {
    const user = userEvent.setup()
    // From the NIC POST until released, every NIC list read fails, so the
    // by-name lookup that follows the Add cannot resolve the new NIC.
    let nicPosted = false
    let lookupDown = true
    requestSpy.mockImplementation((path, opts) => {
      const method = (opts as { method?: string } | undefined)?.method ?? 'GET'
      if (path === '/vms/vm-01/nics' && method === 'POST') nicPosted = true
      return nicPosted && lookupDown && path === '/vms/vm-01/nics' && method === 'GET'
        ? Promise.reject(new ApiError(503, 'Service Unavailable', 'engine busy'))
        : passthrough.request!(path, opts)
    })
    renderWithProviders(<NicsTab vmId="vm-01" />)
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Add network interface' },
        { timeout: FIND_TIMEOUT_MS },
      ),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'nic-lookup')
    await user.selectOptions(
      await within(dialog).findByRole(
        'combobox',
        { name: 'vNIC profile' },
        { timeout: FIND_TIMEOUT_MS },
      ),
      'vnic-03',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add parameter' }))
    await user.type(nameInput(1), 'IP')
    await user.type(valueInput(1), '10.0.0.60')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    await within(dialog).findByText(
      'The network interface was saved, but its network filter parameters were not: engine busy. Save again to retry.',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    // the NIC exists now: its name is locked to what the retry resolves by
    expect(
      (within(dialog).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).disabled,
    ).toBe(true)

    lookupDown = false
    requestSpy.mockClear()
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), {
      timeout: FIND_TIMEOUT_MS,
    })
    // no second NIC POST: only the parameter lands
    expect(writes()).toEqual([
      expect.stringMatching(/^POST \/vms\/vm-01\/nics\/[^/]+\/networkfilterparameters$/),
    ])
    const created = (await listVmNics('vm-01')).filter((nic) => nic.name === 'nic-lookup')
    expect(created).toHaveLength(1)
    const parameters = await listNicNetworkFilterParameters('vm-01', created[0]!.id)
    expect(parameters.map((p) => [p.name, p.value])).toEqual([['IP', '10.0.0.60']])
  })
})
