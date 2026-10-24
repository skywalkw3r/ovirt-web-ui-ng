import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listUnregisteredStorageDomainDisks, registerStorageDomainDisk } from './storageDomains'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (copied from api/vms.test.ts) — exercises the
// resource fns without the mock engine, so the exact path/verb/body is asserted.
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

describe('listUnregisteredStorageDomainDisks', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs the disks subcollection with the unregistered query flag', async () => {
    const fetchMock = mockFetch(200, {
      disk: [
        { id: 'disk-1', alias: 'floater-1', provisioned_size: '1073741824' },
        { id: 'disk-2', alias: 'floater-2' },
      ],
    })

    const disks = await listUnregisteredStorageDomainDisks('sd-01')
    expect(disks).toHaveLength(2)
    // scalars still coerce through DiskSchema even on the unregistered read
    expect(disks[0]).toMatchObject({ id: 'disk-1', provisioned_size: 1073741824 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-01/disks?unregistered=true')
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('returns an empty list when the subcollection 404s', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no unregistered disks' } })
    await expect(listUnregisteredStorageDomainDisks('sd-99')).resolves.toEqual([])
  })

  it('omits the disk key entirely on an empty domain', async () => {
    mockFetch(200, {})
    await expect(listUnregisteredStorageDomainDisks('sd-01')).resolves.toEqual([])
  })

  it('rethrows a non-404 fault as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Server Error', detail: 'SPM unavailable' } })
    const error = await listUnregisteredStorageDomainDisks('sd-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })

  it('encodes the storage domain id', async () => {
    const fetchMock = mockFetch(200, {})
    await listUnregisteredStorageDomainDisks('a b/c')
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/a%20b%2Fc/disks?unregistered=true')
  })
})

describe('registerStorageDomainDisk', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs an empty action body to the disk register sub-resource', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(registerStorageDomainDisk('sd-01', 'disk-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-01/disks/disk-1/register')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('encodes both the domain and disk ids', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await registerStorageDomainDisk('sd 1', 'd/2')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd%201/disks/d%2F2/register')
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Disk already registered' } })

    const error = await registerStorageDomainDisk('sd-01', 'disk-1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Disk already registered' })
  })
})
