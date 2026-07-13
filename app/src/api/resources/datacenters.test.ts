import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanFinishedTasks, deleteDataCenter } from './datacenters'
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

describe('deleteDataCenter', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('DELETEs /datacenters/{id} with no query by default', async () => {
    // the engine answers an empty 204 to a successful remove
    const fetchMock = mockFetch(204)
    await expect(deleteDataCenter('dc-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01')
    expect(init.method).toBe('DELETE')
  })

  it('appends ?force=true when force is requested', async () => {
    const fetchMock = mockFetch(204)
    await deleteDataCenter('dc-01', { force: true })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01?force=true')
    expect(init.method).toBe('DELETE')
  })

  it('omits the query when force is explicitly false', async () => {
    const fetchMock = mockFetch(204)
    await deleteDataCenter('dc-01', { force: false })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01')
  })

  it('encodes the data center id', async () => {
    const fetchMock = mockFetch(204)
    await deleteDataCenter('a b/c', { force: true })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/a%20b%2Fc?force=true')
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Data center is not empty' },
    })

    const error = await deleteDataCenter('dc-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Data center is not empty' })
  })
})

describe('cleanFinishedTasks', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs an empty action body to the cleanfinishedtasks subresource', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(cleanFinishedTasks('dc-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/cleanfinishedtasks')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('encodes the data center id', async () => {
    const fetchMock = mockFetch(200, {})
    await cleanFinishedTasks('a b/c')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/a%20b%2Fc/cleanfinishedtasks')
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'No SPM host' },
    })

    const error = await cleanFinishedTasks('dc-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'No SPM host' })
  })
})
