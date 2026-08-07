import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listStorageDomainLeaseVms } from './leases'
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

describe('listStorageDomainLeaseVms', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vms and keeps only VMs whose lease resides on the domain', async () => {
    const fetchMock = mockFetch(200, {
      vm: [
        { id: 'vm-01', name: 'web-01', lease: { storage_domain: { id: 'sd-01' } } },
        { id: 'vm-02', name: 'db-01', lease: { storage_domain: { id: 'sd-02' } } },
        // no lease at all — must be dropped
        { id: 'vm-03', name: 'cache-01' },
      ],
    })

    const leaseVms = await listStorageDomainLeaseVms('sd-01')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms')
    expect(leaseVms).toEqual([{ id: 'vm-01', name: 'web-01' }])
  })

  it('returns [] when the vm key is omitted (no VMs)', async () => {
    mockFetch(200, {})
    await expect(listStorageDomainLeaseVms('sd-01')).resolves.toEqual([])
  })

  it('returns [] when no VM leases on the domain', async () => {
    mockFetch(200, { vm: [{ id: 'vm-02', lease: { storage_domain: { id: 'sd-02' } } }] })
    await expect(listStorageDomainLeaseVms('sd-01')).resolves.toEqual([])
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })

    const error = await listStorageDomainLeaseVms('sd-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500, message: 'boom' })
  })
})
