import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateStorageDomain,
  deactivateStorageDomain,
  destroyStorageDomain,
  detachStorageDomain,
  removeStorageDomain,
  updateStorageDomain,
} from './resources/storageDomains'
import { clearSessionToken, setSessionToken } from './session'

// Resource-level unit tests: stub global fetch and assert the wire request
// (URL, method, body, query) — mirror api/resources.test.ts. Not mock-engine
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

describe('storage-domain lifecycle resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('detachStorageDomain DELETEs the DC-scoped resource with no body', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(detachStorageDomain('dc-1', 'sd-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-1/storagedomains/sd-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('detachStorageDomain settles on a 204 (empty body)', async () => {
    mockFetch(204)
    await expect(detachStorageDomain('dc-1', 'sd-1')).resolves.toBeUndefined()
  })

  it('activateStorageDomain POSTs an empty action body to .../activate', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(activateStorageDomain('dc-1', 'sd-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-1/storagedomains/sd-1/activate')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
  })

  it('deactivateStorageDomain POSTs an empty action body to .../deactivate by default', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(deactivateStorageDomain('dc-1', 'sd-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-1/storagedomains/sd-1/deactivate')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
  })

  it('deactivateStorageDomain rides force in the action body when forced', async () => {
    const fetchMock = mockFetch(200, {})
    await deactivateStorageDomain('dc-1', 'sd-1', { force: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ force: true })
  })

  it('deactivateStorageDomain omits force from the body when force is false', async () => {
    const fetchMock = mockFetch(200, {})
    await deactivateStorageDomain('dc-1', 'sd-1', { force: false })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe('{}')
  })

  it('updateStorageDomain PUTs only the changed fields and parses the echoed domain', async () => {
    const fetchMock = mockFetch(200, {
      id: 'sd-1',
      name: 'data-renamed',
      type: 'data',
      status: 'active',
      // string scalars — the schema must coerce them
      warning_low_space_indicator: '15',
      critical_space_action_blocker: '8',
      wipe_after_delete: 'true',
      backup: 'false',
    })

    const domain = await updateStorageDomain('sd-1', {
      name: 'data-renamed',
      warning_low_space_indicator: 15,
      critical_space_action_blocker: 8,
      wipe_after_delete: true,
      backup: false,
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'data-renamed',
      warning_low_space_indicator: 15,
      critical_space_action_blocker: 8,
      wipe_after_delete: true,
      backup: false,
    })
    // coerced read model back to the caller
    expect(domain.id).toBe('sd-1')
    expect(domain.warning_low_space_indicator).toBe(15)
    expect(domain.critical_space_action_blocker).toBe(8)
    expect(domain.wipe_after_delete).toBe(true)
    expect(domain.backup).toBe(false)
  })

  it('removeStorageDomain DELETEs /storagedomains/{id} with mandatory host and format=false default', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(removeStorageDomain('sd-1', { host: 'host-01' })).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-1?host=host-01&format=false')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('removeStorageDomain passes format=true when formatting is requested', async () => {
    const fetchMock = mockFetch(200, {})
    await removeStorageDomain('sd-1', { host: 'host-01', format: true })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-1?host=host-01&format=true')
  })

  it('removeStorageDomain URL-encodes a host name with spaces', async () => {
    const fetchMock = mockFetch(200, {})
    await removeStorageDomain('sd-1', { host: 'host 01' })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    // URLSearchParams encodes a space as '+'
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-1?host=host+01&format=false')
  })

  it('destroyStorageDomain DELETEs /storagedomains/{id}?destroy=true with no host', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(destroyStorageDomain('sd-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-1?destroy=true')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('propagates the engine fault as an ApiError on a failed action', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'domain is active' } })
    await expect(detachStorageDomain('dc-1', 'sd-1')).rejects.toMatchObject({
      status: 409,
      detail: 'domain is active',
    })
  })
})
