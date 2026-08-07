import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listStorageDomainImages } from './storageDomains'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (copied from api/resources/users.test.ts) —
// exercises the resource fn without the mock engine, so the exact path/verb and
// the parsed result are asserted directly.
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

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('listStorageDomainImages', () => {
  it('GETs /storagedomains/{id}/images and coerces the string byte size', async () => {
    const fetchMock = mockFetch(200, {
      image: [
        // the live engine serializes size as a JSON string
        { id: 'img-01', name: 'cirros-0.6.iso', type: 'disk', size: '117440512' },
        { id: 'img-02', name: 'floppy.vfd', size: 1474560 },
      ],
    })

    const images = await listStorageDomainImages('sd-03')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/storagedomains/sd-03/images')
    expect(images).toHaveLength(2)
    // string form coerced to a number
    expect(images[0]?.size).toBe(117440512)
    // native number left intact
    expect(images[1]?.size).toBe(1474560)
    expect(images[0]?.name).toBe('cirros-0.6.iso')
  })

  it('encodes the id and tolerates the empty-list quirk', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(listStorageDomainImages('sd 03')).resolves.toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/storagedomains/sd%2003/images')
  })

  it('degrades a 404 subcollection to an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listStorageDomainImages('sd-01')).resolves.toEqual([])
  })

  it('rethrows non-404 faults', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })
    await expect(listStorageDomainImages('sd-01')).rejects.toBeInstanceOf(ApiError)
  })
})
