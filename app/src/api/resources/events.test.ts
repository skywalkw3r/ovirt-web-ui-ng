import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listEvents, removeEvent } from './events'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/resources/tags.test.ts. Assert
// the URL/method the resource emits and the parsed result it returns.
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

describe('listEvents', () => {
  it('defaults to a max-100 window with no search clause', async () => {
    const fetchMock = mockFetch(200, { event: [] })
    await listEvents()
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string, 'http://x')
    expect(url.pathname).toBe('/ovirt-engine/api/events')
    expect(url.searchParams.get('max')).toBe('100')
    expect(url.searchParams.get('search')).toBeNull()
  })

  it('sorts the window newest-first regardless of fixture order', async () => {
    mockFetch(200, {
      event: [
        { id: 'ev-1', time: 100 },
        { id: 'ev-2', time: 300 },
        { id: 'ev-3', time: 200 },
      ],
    })
    const result = await listEvents()
    expect(result.map((e) => e.id)).toEqual(['ev-2', 'ev-3', 'ev-1'])
  })

  it('composes the caller search with the paging tail', async () => {
    const fetchMock = mockFetch(200, { event: [] })
    await listEvents({ search: 'severity=alert', page: 2, max: 25 })
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string, 'http://x')
    expect(url.searchParams.get('max')).toBe('25')
    expect(url.searchParams.get('search')).toBe('severity=alert sortby time desc page 2')
  })

  it('tolerates the omitted-key empty-list quirk', async () => {
    mockFetch(200, {})
    await expect(listEvents()).resolves.toEqual([])
  })
})

describe('removeEvent', () => {
  it('DELETEs /events/{id}', async () => {
    const fetchMock = mockFetch(204)
    await expect(removeEvent('ev-42')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/events/ev-42')
    expect(init.method).toBe('DELETE')
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'cannot remove' } })
    const error = await removeEvent('ev-42').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'cannot remove' })
  })
})
