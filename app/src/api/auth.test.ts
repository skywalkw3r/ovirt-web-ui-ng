import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTest } from '../config/runtime'
import { resetServersForTest } from '../servers/registry'
import { AuthenticationError, obtainToken, revokeToken } from './auth'

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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  // multi-engine cases inject window config; re-resolve to same-origin
  resetRuntimeConfigForTest()
  resetServersForTest()
})

describe('obtainToken', () => {
  it('requests the http grant with Basic credentials', async () => {
    const fetchMock = mockFetch(200, { access_token: 'tok-1', scope: 'ovirt-app-api' })

    const token = await obtainToken('admin@ovirt@internalsso', 'secret')
    expect(token).toBe('tok-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/ovirt-engine/sso/oauth/token')
    expect(url).toContain('grant_type=urn:ovirt:params:oauth:grant-type:http')
    expect(url).toContain('scope=ovirt-app-api')
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: `Basic ${btoa('admin@ovirt@internalsso:secret')}`,
    })
  })

  it('surfaces the SSO error description on bad credentials', async () => {
    mockFetch(400, {
      error: 'access_denied',
      error_description: 'Cannot authenticate user',
    })

    const error = await obtainToken('u', 'wrong').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AuthenticationError)
    expect((error as AuthenticationError).message).toBe('Cannot authenticate user')
    expect((error as AuthenticationError).status).toBe(400)
  })

  it('rejects token payloads without access_token', async () => {
    mockFetch(200, { unexpected: true })
    await expect(obtainToken('u', 'p')).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('sends the grant to the active external server (multi-engine)', async () => {
    vi.stubEnv('VITE_MULTI_ENGINE', '1')
    vi.stubGlobal('window', {
      ovirtWebUiConfig: {
        servers: { list: [{ name: 'HE 2', url: 'https://engine2.example' }] },
      },
    })
    resetRuntimeConfigForTest()
    resetServersForTest()
    const fetchMock = mockFetch(200, { access_token: 'tok-2' })

    await obtainToken('admin@internalsso', 'secret')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('https://engine2.example/ovirt-engine/sso/oauth/token')
  })
})

describe('revokeToken', () => {
  it('posts the token as form data and never throws', async () => {
    const fetchMock = mockFetch(200, {})
    await revokeToken('tok-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/sso/oauth/revoke')
    expect(String(init.body)).toBe('token=tok-1')
  })

  it('swallows network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(revokeToken('tok-1')).resolves.toBeUndefined()
  })
})
