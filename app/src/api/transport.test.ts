import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './transport'
import { resetRuntimeConfigForTest } from '../config/runtime'
import { resetServersForTest } from '../servers/registry'
import { clearSessionToken, setSessionAdmin, setSessionToken } from './session'

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

describe('request', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    // multi-engine cases inject window config; re-resolve to same-origin so
    // the singletons never leak an external base into later tests
    resetRuntimeConfigForTest()
    resetServersForTest()
  })

  it('sends Bearer token, JSON Accept, and the Filter header', async () => {
    const fetchMock = mockFetch(200, { product_info: { name: 'oVirt Engine' } })
    await request('/vms')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms')
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer tok-123',
      Filter: 'true',
    })
  })

  it('sends Filter:false for a server-verified admin session', async () => {
    setSessionAdmin(true)
    const fetchMock = mockFetch(200, {})
    await request('/vms')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({ Filter: 'false' })
    // clearSessionToken (afterEach) resets the admin flag so later tests
    // default back to Filter:true.
  })

  it('serializes bodies and sets Content-Type', async () => {
    const fetchMock = mockFetch(200, {})
    await request('/vms/abc/start', { method: 'POST', body: { async_: 'false' } })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"async_":"false"}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('maps the oVirt fault envelope to ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'VM is locked' },
    })

    const error = await request('/vms/abc').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      reason: 'Operation Failed',
      detail: 'VM is locked',
      message: 'VM is locked',
    })
  })

  it('throws ApiError on non-JSON error bodies without crashing', async () => {
    mockFetch(502)
    const error = await request('/vms').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
  })

  it('prefixes the URL with the active external server base (multi-engine)', async () => {
    vi.stubEnv('VITE_MULTI_ENGINE', '1')
    vi.stubGlobal('window', {
      ovirtWebUiConfig: {
        servers: { list: [{ name: 'HE 2', url: 'https://engine2.example' }] },
      },
    })
    resetRuntimeConfigForTest()
    resetServersForTest()
    const fetchMock = mockFetch(200, {})
    await request('/vms')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://engine2.example/ovirt-engine/api/vms')
  })

  it('rejects before fetching when no session token is set', async () => {
    clearSessionToken()
    const fetchMock = mockFetch(200, {})

    const error = await request('/vms').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
