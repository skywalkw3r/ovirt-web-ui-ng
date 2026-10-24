import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshStorageDomainLuns, updateStorageDomainOvfStore } from './resources/storageDomains'
import { ApiError } from './transport'
import { clearSessionToken, setSessionToken } from './session'

// Resource-level unit tests: stub global fetch and assert the wire request
// (URL, method, body) — mirror storage-domain-lifecycle.test.ts. Not mock-engine
// backed; the mock owner exercises dispatch separately in handlers.test.ts.
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

describe('storage-domain maintenance resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('updateStorageDomainOvfStore POSTs an empty action body to .../updateovfstore', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(updateStorageDomainOvfStore('sd-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-1/updateovfstore')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('updateStorageDomainOvfStore settles on a 204 (empty body)', async () => {
    mockFetch(204)
    await expect(updateStorageDomainOvfStore('sd-1')).resolves.toBeUndefined()
  })

  it('updateStorageDomainOvfStore URL-encodes the domain id', async () => {
    const fetchMock = mockFetch(200, {})
    await updateStorageDomainOvfStore('sd/1')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd%2F1/updateovfstore')
  })

  it('refreshStorageDomainLuns POSTs an empty action body to .../refreshluns (rescan all)', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(refreshStorageDomainLuns('sd-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-1/refreshluns')
    expect(init.method).toBe('POST')
    // no logical_units → the engine rescans every LUN on the domain
    expect(init.body).toBe('{}')
  })

  it('refreshStorageDomainLuns settles on a 204 (empty body)', async () => {
    mockFetch(204)
    await expect(refreshStorageDomainLuns('sd-1')).resolves.toBeUndefined()
  })

  it('propagates the engine fault as an ApiError on a failed OVF update', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'OVF update already running' } })

    const error = await updateStorageDomainOvfStore('sd-1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'OVF update already running' })
  })

  it('propagates the engine fault as an ApiError on a failed LUN refresh', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'domain is not block storage' } })

    await expect(refreshStorageDomainLuns('sd-1')).rejects.toMatchObject({
      status: 409,
      detail: 'domain is not block storage',
    })
  })
})
