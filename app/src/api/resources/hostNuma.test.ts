import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listHostNumaNodes } from './hostNuma'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (copied from api/hosts.test.ts) — exercises the
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

describe('listHostNumaNodes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /hosts/{id}/numanodes and coerces string scalars', async () => {
    const fetchMock = mockFetch(200, {
      host_numa_node: [
        {
          id: 'numa-0',
          // the live engine serializes these as JSON strings
          index: '0',
          memory: '16384',
          cpu: { cores: { core: [{ index: '0' }, { index: '1' }] } },
        },
      ],
    })

    const nodes = await listHostNumaNodes('host-01')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/numanodes')
    expect(init.method ?? 'GET').toBe('GET')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].index).toBe(0)
    expect(nodes[0].memory).toBe(16384)
    expect(nodes[0].cpu?.cores?.core?.map((c) => c.index)).toEqual([0, 1])
  })

  it('returns [] when the host_numa_node key is omitted (empty topology)', async () => {
    mockFetch(200, {})
    await expect(listHostNumaNodes('host-01')).resolves.toEqual([])
  })

  it('encodes the host id', async () => {
    const fetchMock = mockFetch(200, { host_numa_node: [] })
    await listHostNumaNodes('a b/c')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/a%20b%2Fc/numanodes')
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'Host does not exist' } })

    const error = await listHostNumaNodes('host-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Host does not exist' })
  })
})
