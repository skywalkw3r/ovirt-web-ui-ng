import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addVmNumaNode,
  applyVmNumaSteps,
  listVmNumaNodes,
  pinnedHostNodeIndices,
  removeVmNumaNode,
  updateVmNumaNodePinning,
  vmNumaNodeBody,
  vmNumaNodeCpuIndices,
} from './vmNuma'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (copied from api/hostNuma.test.ts) — exercises the
// resource fn without the mock engine, so the exact path/verb is asserted.
function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('listVmNumaNodes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vms/{id}/numanodes and coerces string scalars, parsing pins', async () => {
    const fetchMock = mockFetch(200, {
      vm_numa_node: [
        {
          id: 'vnode-0',
          // the live engine serializes these as JSON strings
          index: '0',
          memory: '2048',
          cpu: { cores: { core: [{ index: '0' }, { index: '1' }] } },
          numa_node_pins: { numa_node_pin: [{ index: '1' }] },
        },
      ],
    })

    const nodes = await listVmNumaNodes('vm-01')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/numanodes')
    expect(init.method ?? 'GET').toBe('GET')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].index).toBe(0)
    expect(nodes[0].memory).toBe(2048)
    expect(vmNumaNodeCpuIndices(nodes[0])).toEqual([0, 1])
    expect(pinnedHostNodeIndices(nodes[0])).toEqual([1])
  })

  it('returns [] when the vm_numa_node key is omitted (no vNUMA topology)', async () => {
    mockFetch(200, {})
    await expect(listVmNumaNodes('vm-01')).resolves.toEqual([])
  })

  it('degrades a 404 (optional subcollection) to []', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no such subcollection' } })
    await expect(listVmNumaNodes('vm-01')).resolves.toEqual([])
  })

  it('surfaces a non-404 fault envelope as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Server Error', detail: 'boom' } })
    const error = await listVmNumaNodes('vm-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500, message: 'boom' })
  })

  it('encodes the vm id', async () => {
    const fetchMock = mockFetch(200, { vm_numa_node: [] })
    await listVmNumaNodes('a b/c')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/a%20b%2Fc/numanodes')
  })
})

describe('pinnedHostNodeIndices', () => {
  it('dedupes and sorts the pinned physical node indices', () => {
    expect(
      pinnedHostNodeIndices({
        numa_node_pins: { numa_node_pin: [{ index: 2 }, { index: 0 }, { index: 2 }] },
      }),
    ).toEqual([0, 2])
  })

  it('is empty for an unpinned virtual node', () => {
    expect(pinnedHostNodeIndices({ index: 0 })).toEqual([])
  })
})

describe('vNUMA writes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  const spec = { index: 1, memoryMb: 2048, cpuIds: [2, 3], tuneMode: 'strict', pins: [1] }
  const call = (fetchMock: ReturnType<typeof mockFetch>, n = 0) => {
    const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit]
    return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined }
  }

  it('builds the Add body, leaving an unpinned node without numa_node_pins', () => {
    expect(vmNumaNodeBody(spec)).toEqual({
      index: 1,
      memory: 2048,
      cpu: { cores: { core: [{ index: 2 }, { index: 3 }] } },
      numa_tune_mode: 'strict',
      numa_node_pins: { numa_node_pin: [{ index: 1 }] },
    })
    expect(vmNumaNodeBody({ ...spec, pins: [] })).not.toHaveProperty('numa_node_pins')
  })

  it('POSTs a new node and parses the echo', async () => {
    const fetchMock = mockFetch(201, { id: 'vnode-1', index: '1', memory: '2048' })
    const node = await addVmNumaNode('vm-01', spec)
    expect(call(fetchMock)).toMatchObject({
      url: '/ovirt-engine/api/vms/vm-01/numanodes',
      method: 'POST',
    })
    expect(node).toMatchObject({ id: 'vnode-1', index: 1, memory: 2048 })
  })

  it('PUTs only the tune mode and the pins, an empty pin list unpinning', async () => {
    const fetchMock = mockFetch(200, {})
    await updateVmNumaNodePinning('vm-01', 'vnode-1', { tuneMode: 'interleave', pins: [] })
    expect(call(fetchMock)).toEqual({
      url: '/ovirt-engine/api/vms/vm-01/numanodes/vnode-1',
      method: 'PUT',
      body: { numa_tune_mode: 'interleave', numa_node_pins: { numa_node_pin: [] } },
    })
  })

  it('DELETEs a node and treats a 404 as already removed', async () => {
    const fetchMock = mockFetch(200, {})
    await removeVmNumaNode('vm-01', 'vnode-1')
    expect(call(fetchMock)).toMatchObject({
      url: '/ovirt-engine/api/vms/vm-01/numanodes/vnode-1',
      method: 'DELETE',
    })
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'gone' } })
    await expect(removeVmNumaNode('vm-01', 'vnode-1')).resolves.toBeUndefined()
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'locked' } })
    await expect(removeVmNumaNode('vm-01', 'vnode-1')).rejects.toMatchObject({ status: 409 })
  })

  it('runs steps in order and stops at the first fault', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ fault: { reason: 'Operation Failed', detail: 'bad index' } }),
      })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      applyVmNumaSteps('vm-01', [
        { kind: 'remove', nodeId: 'vnode-1' },
        { kind: 'add', node: spec },
        { kind: 'update', nodeId: 'vnode-0', tuneMode: 'strict', pins: [0] },
      ]),
    ).rejects.toMatchObject({ status: 409, message: 'bad index' })
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual([
      'DELETE',
      'POST',
    ])
  })
})
