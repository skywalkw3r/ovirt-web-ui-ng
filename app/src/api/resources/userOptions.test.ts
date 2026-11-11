import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addUserOption,
  fetchAuthenticatedUserId,
  listUserOptions,
  removeUserOption,
} from './userOptions'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (the bookmarks.test.ts pattern): assert the
// URL/method/body each call emits and the parsed result.
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

describe('fetchAuthenticatedUserId', () => {
  it('reads the id off the api root authenticated_user link', async () => {
    const fetchMock = mockFetch(200, {
      authenticated_user: { id: 'u-123', href: '/ovirt-engine/api/users/u-123' },
    })
    await expect(fetchAuthenticatedUserId()).resolves.toBe('u-123')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api')
  })

  it('is undefined when the root carries no authenticated_user', async () => {
    mockFetch(200, { product_info: { name: 'oVirt Engine' } })
    await expect(fetchAuthenticatedUserId()).resolves.toBeUndefined()
  })
})

describe('listUserOptions', () => {
  it('GETs /users/{id}/options and returns the parsed collection', async () => {
    const fetchMock = mockFetch(200, {
      user_option: [
        {
          id: 'o1',
          name: 'webUiNg.settings',
          content: '{"version":1}',
          user: { id: 'u 1', href: '/ovirt-engine/api/users/u%201' },
        },
      ],
    })
    const result = await listUserOptions('u 1')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/users/u%201/options')
    expect(result).toMatchObject([{ id: 'o1', name: 'webUiNg.settings', content: '{"version":1}' }])
  })

  it('tolerates the omitted-key empty-list quirk', async () => {
    mockFetch(200, {})
    await expect(listUserOptions('u1')).resolves.toEqual([])
  })

  it('surfaces a 404 (engine before 4.4.5) as ApiError so callers can degrade', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    const error = await listUserOptions('u1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404 })
  })
})

describe('addUserOption', () => {
  it('POSTs { name, content } and returns the created option', async () => {
    const fetchMock = mockFetch(201, { id: 'o2', name: 'webUiNg.settings', content: '{}' })
    const result = await addUserOption('u1', 'webUiNg.settings', '{}')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users/u1/options')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'webUiNg.settings', content: '{}' })
    expect(result).toMatchObject({ id: 'o2' })
  })
})

describe('removeUserOption', () => {
  it('DELETEs /users/{id}/options/{optionId}', async () => {
    const fetchMock = mockFetch(204)
    await removeUserOption('u1', 'o/2')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users/u1/options/o%2F2')
    expect(init.method).toBe('DELETE')
  })
})
