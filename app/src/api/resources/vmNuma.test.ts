import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listVmNumaNodes, pinnedHostNodeIndices, vmNumaNodeCpuIndices } from './vmNuma'
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
