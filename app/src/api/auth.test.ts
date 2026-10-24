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
  it('posts scope + token to the token-scoped logout endpoint', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(revokeToken('tok-1')).resolves.toBe(true)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // NOT /sso/oauth/revoke: that servlet demands client_id + client_secret,
    // which a browser has none of — see the regression test below.
    expect(url).toBe('/ovirt-engine/services/sso-logout')
    expect(String(init.body)).toBe('scope=ovirt-app-api&token=tok-1')
    // survives the tab closing right after the user clicks Sign out
    expect(init.keepalive).toBe(true)
  })

  // The bug this endpoint choice exists to prevent: the old code posted to
  // /sso/oauth/revoke with token only, got 400 invalid_request back on EVERY
  // sign-out, and discarded the response — so a token nobody had revoked
  // looked revoked. Whatever the engine says, an unconfirmed revoke must
  // report false rather than pass silently.
  it('reports failure when the engine rejects the revoke', async () => {
    mockFetch(400, {
      error: 'invalid_request',
      error_description: "Missing parameter: 'client_id'",
    })
    await expect(revokeToken('tok-1')).resolves.toBe(false)
  })

  // oVirt signals SSO faults in the BODY, sometimes under a 200 — status alone
  // is not evidence of revocation.
  it('reports failure on an error body served with a 200', async () => {
    mockFetch(200, { error: 'invalid_grant', error_description: 'token not found' })
    await expect(revokeToken('tok-1')).resolves.toBe(false)
  })

  it('reports failure but never throws when the engine is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(revokeToken('tok-1')).resolves.toBe(false)
  })

  it('treats an empty success body as revoked', async () => {
    // the live engine answers `200 { }`
    mockFetch(200, {})
    await expect(revokeToken('tok-1')).resolves.toBe(true)
  })
})
