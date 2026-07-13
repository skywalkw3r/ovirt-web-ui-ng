import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStorageDomainDiskProfile,
  deleteDiskProfile,
  listStorageDomainDiskProfiles,
  updateDiskProfile,
} from './diskProfiles'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — same shape as resources/users.test.ts. Assert
// the URL/method/body the resource emits and the parsed result it returns.
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

describe('listStorageDomainDiskProfiles', () => {
  it('GETs the diskprofiles subcollection and keeps the bare qos link', async () => {
    const fetchMock = mockFetch(200, {
      disk_profile: [
        { id: 'dp-01', name: 'gold', description: 'fast tier', qos: { id: 'qos-01' } },
        { id: 'dp-02', name: 'default' },
      ],
    })

    const profiles = await listStorageDomainDiskProfiles('sd-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/storagedomains/sd-01/diskprofiles')
    expect(profiles).toHaveLength(2)
    expect(profiles[0]?.qos?.id).toBe('qos-01')
    expect(profiles[1]?.qos).toBeUndefined()
  })

  it('tolerates the empty-list key-omission quirk', async () => {
    mockFetch(200, {})
    await expect(listStorageDomainDiskProfiles('sd-01')).resolves.toEqual([])
  })

  it('maps a 404 on the optional subcollection to an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listStorageDomainDiskProfiles('sd-iso')).resolves.toEqual([])
  })
})

describe('createStorageDomainDiskProfile', () => {
  it('POSTs name + qos link and omits blank optionals', async () => {
    const fetchMock = mockFetch(200, { id: 'dp-09', name: 'gold' })

    const profile = await createStorageDomainDiskProfile('sd-01', {
      name: 'gold',
      qosId: 'qos-01',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-01/diskprofiles')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'gold', qos: { id: 'qos-01' } })
    expect(profile.id).toBe('dp-09')
  })

  it('includes the description when one is given', async () => {
    const fetchMock = mockFetch(200, { id: 'dp-10' })
    await createStorageDomainDiskProfile('sd-01', { name: 'bronze', description: 'slow tier' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ name: 'bronze', description: 'slow tier' })
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Name in use' } })
    const error = await createStorageDomainDiskProfile('sd-01', { name: 'gold' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Name in use' })
  })
})

describe('updateDiskProfile', () => {
  it('PUTs against the top-level /diskprofiles resource', async () => {
    const fetchMock = mockFetch(200, { id: 'dp-01', name: 'gold-v2', qos: { id: 'qos-02' } })

    const profile = await updateDiskProfile('dp-01', { name: 'gold-v2', qosId: 'qos-02' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/diskprofiles/dp-01')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'gold-v2', qos: { id: 'qos-02' } })
    expect(profile.name).toBe('gold-v2')
  })
})

describe('deleteDiskProfile', () => {
  it('DELETEs the profile and resolves void', async () => {
    const fetchMock = mockFetch(204)
    await expect(deleteDiskProfile('dp-01')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/diskprofiles/dp-01')
    expect(init.method).toBe('DELETE')
  })
})
