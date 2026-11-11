// @vitest-environment jsdom
import '../../test/env'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockRequest } from '../../api/mock/handlers'
import { listVmNumaNodes, pinnedHostNodeIndices, vmNumaNodeBody } from '../../api/resources/vmNuma'
import type { Vm } from '../../api/schemas/vm'
import { ApiError, FIND_TIMEOUT_MS, renderWithProviders } from '../../test/render'
import { EditVmModal } from './EditVmModal'

// The transport is wrapped, not replaced (EditVmModal.watchdog.test.tsx
// pattern): every request lands in the mock engine, and a test can fail one
// call and read back which calls were sent.
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

const sent = () =>
  requestSpy.mock.calls.map(
    ([path, opts]) => `${(opts as { method?: string } | undefined)?.method ?? 'GET'} ${path}`,
  )
const writes = () => sent().filter((call) => !call.startsWith('GET'))
const bodyOf = (call: string) => {
  const found = requestSpy.mock.calls.find(
    ([path, opts]) =>
      `${(opts as { method?: string } | undefined)?.method ?? 'GET'} ${path}` === call,
  )
  return (found?.[1] as { body?: Record<string, unknown> } | undefined)?.body
}

const GiB = 1024 * 1024 * 1024

// vm-05 exists in the mock without vNUMA nodes; the read model here gives it 4
// vCPUs, 4 GiB and a pin to host-01 (node-01), whose mock NUMA fixture reports
// physical nodes 0 and 1.
function vmFixture(status: string, overrides: Partial<Vm> = {}): Vm {
  return {
    id: 'vm-05',
    name: 'vm-05',
    status,
    memory: 4 * GiB,
    memory_policy: { guaranteed: 4 * GiB, max: 16 * GiB },
    cluster: { id: 'cluster-01' },
    cpu: { architecture: 'x86_64', topology: { sockets: 4, cores: 1, threads: 1 } },
    placement_policy: { hosts: { host: [{ id: 'host-01' }] } },
    ...overrides,
  } as Vm
}

afterEach(() => {
  requestSpy.mockReset()
  requestSpy.mockImplementation(passthrough.request!)
})

async function openHostTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Host' }, { timeout: FIND_TIMEOUT_MS }))
}

const countInput = () =>
  screen.findByRole('spinbutton', { name: 'NUMA node count' }, { timeout: FIND_TIMEOUT_MS })

async function setCount(user: ReturnType<typeof userEvent.setup>, count: string) {
  const input = await countInput()
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false))
  await user.clear(input)
  await user.type(input, count)
}

// Two pinned nodes laid out like webadmin's default for the 4 vCPU fixture,
// written straight into the mock engine (the session only exists once the
// render has logged in).
async function seedTwoNodes() {
  for (const index of [0, 1]) {
    await mockRequest('/vms/vm-05/numanodes', {
      method: 'POST',
      body: vmNumaNodeBody({
        index,
        memoryMb: 2048,
        cpuIds: [index * 2, index * 2 + 1],
        tuneMode: 'interleave',
        pins: [index],
      }),
    })
  }
}

describe('EditVmModal CPU pinning and vNUMA', () => {
  it('adds pinned vNUMA nodes on a down VM after the vm PUT', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vmFixture('down')} isOpen onClose={onClose} />)
    await openHostTab(user)
    await setCount(user, '2')
    const pin0 = await screen.findByRole(
      'combobox',
      { name: 'Host NUMA node for NUMA node 0' },
      { timeout: FIND_TIMEOUT_MS },
    )
    await waitFor(() => expect((pin0 as HTMLSelectElement).disabled).toBe(false), {
      timeout: FIND_TIMEOUT_MS,
    })
    await user.selectOptions(pin0, '0')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Host NUMA node for NUMA node 1' }),
      '1',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tune mode of NUMA node 0' }),
      'strict',
    )
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    // pinning a node also flips the migration mode (webadmin's default), so the
    // vm PUT rides first and the new nodes follow it
    expect(writes()).toEqual([
      'PUT /vms/vm-05',
      'POST /vms/vm-05/numanodes',
      'POST /vms/vm-05/numanodes',
    ])
    expect(bodyOf('PUT /vms/vm-05')?.placement_policy).toEqual({ affinity: 'user_migratable' })
    const nodes = await listVmNumaNodes('vm-05')
    expect(nodes.map((node) => [node.index, node.memory, node.numa_tune_mode])).toEqual([
      [0, 2048, 'strict'],
      [1, 2048, 'interleave'],
    ])
    expect(nodes.map(pinnedHostNodeIndices)).toEqual([[0], [1]])
  })

  it('rebuilds the topology around the vm PUT when the vCPU count moves', async () => {
    await seedTwoNodes()
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vmFixture('down')} isOpen onClose={onClose} />)
    await openHostTab(user)
    await countInput()
    await user.click(screen.getByRole('tab', { name: 'System' }))
    const sockets = screen.getByRole('spinbutton', { name: 'Virtual Sockets' })
    await user.clear(sockets)
    await user.type(sockets, '2')
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(writes()).toEqual([
      'DELETE /vms/vm-05/numanodes/vm-05-vnuma-new-2',
      'DELETE /vms/vm-05/numanodes/vm-05-vnuma-new-1',
      'PUT /vms/vm-05',
      'POST /vms/vm-05/numanodes',
      'POST /vms/vm-05/numanodes',
    ])
    const nodes = await listVmNumaNodes('vm-05')
    expect(nodes.map((node) => node.cpu?.cores?.core?.map((core) => core.index))).toEqual([
      [0],
      [1],
    ])
    // the pins survive the redistribution
    expect(nodes.map(pinnedHostNodeIndices)).toEqual([[0], [1]])
  })

  it('says the VM was left without nodes when the vm PUT fails after the removals', async () => {
    await seedTwoNodes()
    let failPut = true
    requestSpy.mockImplementation((path, opts) =>
      failPut &&
      path === '/vms/vm-05' &&
      (opts as { method?: string } | undefined)?.method === 'PUT'
        ? Promise.reject(new ApiError(409, 'Conflict', 'vm is locked'))
        : passthrough.request!(path, opts),
    )
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vmFixture('down')} isOpen onClose={onClose} />)
    await openHostTab(user)
    await countInput()
    await user.click(screen.getByRole('tab', { name: 'System' }))
    const sockets = screen.getByRole('spinbutton', { name: 'Virtual Sockets' })
    await user.clear(sockets)
    await user.type(sockets, '2')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText(
      'The old virtual NUMA nodes were removed, but the VM could not be saved, so the new nodes were not added: vm is locked. Save again to retry.',
      undefined,
      { timeout: FIND_TIMEOUT_MS },
    )
    expect(screen.getByText('The VM now has no virtual NUMA nodes.')).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()
    await expect(listVmNumaNodes('vm-05')).resolves.toEqual([])

    failPut = false
    requestSpy.mockClear()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    // the removals already landed: the retry only saves the VM and adds
    expect(writes()).toEqual([
      'PUT /vms/vm-05',
      'POST /vms/vm-05/numanodes',
      'POST /vms/vm-05/numanodes',
    ])
    await expect(listVmNumaNodes('vm-05')).resolves.toHaveLength(2)
  })

  it('validates manual pinning and sends it with the policy', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vmFixture('down')} isOpen onClose={onClose} />)
    await openHostTab(user)
    await countInput()
    await user.selectOptions(screen.getByRole('combobox', { name: 'CPU pinning policy' }), 'manual')
    const save = screen.getByRole('button', { name: 'Save' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    const topology = screen.getByRole('textbox', { name: 'CPU pinning topology' })
    await user.type(topology, '0#0_4#1')
    expect(screen.getByText('vCPU 4 does not exist; this VM has vCPUs 0 to 3.')).toBeDefined()
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await user.clear(topology)
    await user.type(topology, '0#0_1#1-3')
    expect((save as HTMLButtonElement).disabled).toBe(false)
    requestSpy.mockClear()
    await user.click(save)

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: FIND_TIMEOUT_MS })
    expect(writes()).toEqual(['PUT /vms/vm-05'])
    const body = bodyOf('PUT /vms/vm-05')!
    expect(body.cpu_pinning_policy).toBe('manual')
    expect((body.cpu as Record<string, unknown>).cpu_tune).toEqual({
      vcpu_pins: {
        vcpu_pin: [
          { vcpu: 0, cpu_set: '0' },
          { vcpu: 1, cpu_set: '1-3' },
        ],
      },
    })
    // webadmin's default: a pinned VM migrates manually only
    expect((body.placement_policy as Record<string, unknown>).affinity).toBe('user_migratable')
  })

  it('keeps the vNUMA nodes read-only on a running VM and stages pinning as next-run', async () => {
    await seedTwoNodes()
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<EditVmModal vm={vmFixture('up')} isOpen onClose={onClose} />)
    await openHostTab(user)
    const count = await countInput()
    await waitFor(() => expect((count as HTMLInputElement).value).toBe('2'), {
      timeout: FIND_TIMEOUT_MS,
    })
    expect((count as HTMLInputElement).disabled).toBe(true)
    expect(
      screen.getByText('The virtual NUMA nodes can only be changed while the VM is down.'),
    ).toBeDefined()
    // a pinned vNUMA node rules out Dedicated
    const policy = screen.getByRole('combobox', { name: 'CPU pinning policy' })
    expect((policy.querySelector('option[value="dedicated"]') as HTMLOptionElement).disabled).toBe(
      true,
    )
    await user.selectOptions(policy, 'manual')
    await user.type(screen.getByRole('textbox', { name: 'CPU pinning topology' }), '0#0')
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
    expect(writes()).toEqual(['PUT /vms/vm-05?next_run=true'])
  })
})
