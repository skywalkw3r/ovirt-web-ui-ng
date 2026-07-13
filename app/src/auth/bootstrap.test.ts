import { afterEach, describe, expect, it, vi } from 'vitest'
import { readInjectedSession } from './bootstrap'

// The test runner uses the 'node' environment, so window is not defined by
// default — each case stubs the exact global the engine would inject.
function stubUserInfo(userInfo: unknown) {
  vi.stubGlobal('window', { userInfo })
}

afterEach(() => vi.unstubAllGlobals())

describe('readInjectedSession', () => {
  it('returns the seeded session for a well-shaped window.userInfo', () => {
    stubUserInfo({
      ssoToken: 'sso-abc',
      userName: 'admin@ovirt@internalsso',
      domain: 'internal',
      userId: 'u-1',
      sessionAgeInSec: '42',
    })

    expect(readInjectedSession()).toEqual({
      token: 'sso-abc',
      username: 'admin@ovirt@internalsso',
    })
  })

  it('returns null when window.userInfo is absent (dev / non-bootstrapped page)', () => {
    vi.stubGlobal('window', {})
    expect(readInjectedSession()).toBeNull()
  })

  it('returns null for a blank token (legacy treats empty ssoToken as no session)', () => {
    stubUserInfo({ ssoToken: '', userName: 'someone' })
    expect(readInjectedSession()).toBeNull()
  })

  it('returns null when the token is missing', () => {
    stubUserInfo({ userName: 'someone' })
    expect(readInjectedSession()).toBeNull()
  })

  it('returns null when the username is missing', () => {
    stubUserInfo({ ssoToken: 'sso-abc' })
    expect(readInjectedSession()).toBeNull()
  })

  it('returns null for a malformed (non-object) window.userInfo', () => {
    stubUserInfo('not-an-object')
    expect(readInjectedSession()).toBeNull()
  })

  it('returns null when ssoToken is the wrong type', () => {
    stubUserInfo({ ssoToken: 12345, userName: 'someone' })
    expect(readInjectedSession()).toBeNull()
  })
})
