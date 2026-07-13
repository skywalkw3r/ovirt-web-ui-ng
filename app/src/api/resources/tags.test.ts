import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachHostTag,
  attachUserTag,
  detachHostTag,
  detachUserTag,
  listHostTags,
  listUserTags,
} from './tags'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/users.test.ts. Assert the
// URL/method/body the resource emits and the parsed result it returns.
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

describe('listHostTags', () => {
  it('GETs /hosts/{id}/tags and returns the assigned tags', async () => {
    const fetchMock = mockFetch(200, { tag: [{ id: 'tag-01', name: 'prod' }] })
    const result = await listHostTags('host-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/hosts/host-01/tags')
    expect(result[0]?.name).toBe('prod')
  })

  it('tolerates the omitted-key empty-list quirk', async () => {
    mockFetch(200, {})
    await expect(listHostTags('host-01')).resolves.toEqual([])
  })
})

describe('attachHostTag', () => {
  it('POSTs the tag by name to /hosts/{id}/tags', async () => {
    const fetchMock = mockFetch(201, { id: 'tag-01', name: 'prod' })
    await expect(attachHostTag('host-01', 'prod')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/tags')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'prod' })
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'already attached' } })
    const error = await attachHostTag('host-01', 'prod').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'already attached' })
  })
})

describe('detachHostTag', () => {
  it('DELETEs the tag by id from /hosts/{id}/tags/{tagId}', async () => {
    const fetchMock = mockFetch(204)
    await expect(detachHostTag('host-01', 'tag-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/tags/tag-01')
    expect(init.method).toBe('DELETE')
  })
})

describe('listUserTags', () => {
  it('GETs /users/{id}/tags and returns the assigned tags', async () => {
    const fetchMock = mockFetch(200, { tag: [{ id: 'tag-02', name: 'ops' }] })
    const result = await listUserTags('user-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/users/user-01/tags')
    expect(result[0]?.name).toBe('ops')
  })

  it('tolerates the omitted-key empty-list quirk', async () => {
    mockFetch(200, {})
    await expect(listUserTags('user-01')).resolves.toEqual([])
  })
})

describe('attachUserTag', () => {
  it('POSTs the tag by name to /users/{id}/tags', async () => {
    const fetchMock = mockFetch(201, { id: 'tag-02', name: 'ops' })
    await expect(attachUserTag('user-01', 'ops')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users/user-01/tags')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'ops' })
  })
})

describe('detachUserTag', () => {
  it('DELETEs the tag by id from /users/{id}/tags/{tagId}', async () => {
    const fetchMock = mockFetch(204)
    await expect(detachUserTag('user-01', 'tag-02')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users/user-01/tags/tag-02')
    expect(init.method).toBe('DELETE')
  })
})
