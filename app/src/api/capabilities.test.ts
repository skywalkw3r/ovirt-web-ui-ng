import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCapabilityProfile } from './resources/users'
import { setSessionToken, clearSessionToken } from './session'

// Drives fetchCapabilityProfile against scripted transport responses, one per
// call in order: [0] = GET /api root, [1] = GET /users/{id}/permissions.
function mockResponses(...payloads: unknown[]) {
  let call = 0
  const fn = vi.fn().mockImplementation(() => {
    const status = 200
    const body = payloads[call++]
    return Promise.resolve({
      ok: true,
      status,
      json: () => Promise.resolve(body),
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('fetchCapabilityProfile', () => {
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('fast path: an inlined admin* user_name (mock) → admin without a second call', async () => {
    setSessionToken('t')
    const fetchMock = mockResponses({
      authenticated_user: { id: 'u1', user_name: 'admin@internal' },
    })

    const profile = await fetchCapabilityProfile()
    expect(profile).toEqual({ tier: 'admin', isAdmin: true, username: 'admin@internal' })
    expect(fetchMock).toHaveBeenCalledTimes(1) // no permissions lookup needed
  })

  it('real engine: no user_name, an administrative role → admin (string "true" coerced)', async () => {
    setSessionToken('t')
    mockResponses(
      { authenticated_user: { id: 'u1' } },
      { permission: [{ role: { name: 'SuperUser', administrative: 'true' } }] },
    )

    const profile = await fetchCapabilityProfile()
    expect(profile.isAdmin).toBe(true)
    expect(profile.tier).toBe('admin')
  })

  it('real engine: only non-administrative roles → user tier', async () => {
    setSessionToken('t')
    mockResponses(
      { authenticated_user: { id: 'u1' } },
      { permission: [{ role: { name: 'UserRole', administrative: 'false' } }] },
    )

    const profile = await fetchCapabilityProfile()
    expect(profile.isAdmin).toBe(false)
    expect(profile.tier).toBe('user')
  })

  it('degrades to user tier when the permissions lookup fails', async () => {
    setSessionToken('t')
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        if (call++ === 0) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ authenticated_user: { id: 'u1' } }),
          })
        }
        return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })
      }),
    )

    const profile = await fetchCapabilityProfile()
    expect(profile).toEqual({ tier: 'user', isAdmin: false, username: undefined })
  })
})
