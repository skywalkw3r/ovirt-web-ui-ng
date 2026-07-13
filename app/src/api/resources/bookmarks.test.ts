import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBookmark, listBookmarks, removeBookmark, updateBookmark } from './bookmarks'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/resources/tags.test.ts. Assert
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

describe('listBookmarks', () => {
  it('GETs /bookmarks and returns the parsed collection', async () => {
    const fetchMock = mockFetch(200, {
      bookmark: [
        { id: 'bm-01', name: 'vms/up', value: 'status=up' },
        { id: 'bm-02', name: 'hosts/maint', value: 'status=maintenance' },
      ],
    })
    const result = await listBookmarks()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/bookmarks')
    expect(result).toEqual([
      { id: 'bm-01', name: 'vms/up', value: 'status=up' },
      { id: 'bm-02', name: 'hosts/maint', value: 'status=maintenance' },
    ])
  })

  it('tolerates the omitted-key empty-list quirk', async () => {
    mockFetch(200, {})
    await expect(listBookmarks()).resolves.toEqual([])
  })

  it('surfaces a 403 as ApiError so callers can degrade', async () => {
    mockFetch(403, { fault: { reason: 'Operation Failed', detail: 'not permitted' } })
    const error = await listBookmarks().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403 })
  })
})

describe('createBookmark', () => {
  it('POSTs { name, value } to /bookmarks and returns the created bookmark', async () => {
    const fetchMock = mockFetch(201, { id: 'bm-03', name: 'vms/down', value: 'status=down' })
    const result = await createBookmark('vms/down', 'status=down')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/bookmarks')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'vms/down', value: 'status=down' })
    expect(result).toMatchObject({ id: 'bm-03', name: 'vms/down' })
  })
})

describe('updateBookmark', () => {
  it('PUTs the changed fields to /bookmarks/{id}', async () => {
    const fetchMock = mockFetch(200, { id: 'bm-01', name: 'vms/up', value: 'name=web*' })
    const result = await updateBookmark('bm-01', { value: 'name=web*' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/bookmarks/bm-01')
    expect(init.method).toBe('PUT')
    // undefined name is dropped by JSON.stringify — an omitted change means keep
    expect(JSON.parse(init.body as string)).toEqual({ value: 'name=web*' })
    expect(result).toMatchObject({ value: 'name=web*' })
  })

  it('encodes the id into the path', async () => {
    const fetchMock = mockFetch(200, { id: 'a/b', name: 'vms/x', value: 'q' })
    await updateBookmark('a/b', { name: 'vms/x' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/bookmarks/a%2Fb')
  })
})

describe('removeBookmark', () => {
  it('DELETEs /bookmarks/{id}', async () => {
    const fetchMock = mockFetch(204)
    await expect(removeBookmark('bm-02')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/bookmarks/bm-02')
    expect(init.method).toBe('DELETE')
  })
})
