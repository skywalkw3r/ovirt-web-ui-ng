import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSessionToken, setSessionServerBase, setSessionToken } from '../api/session'
import { resetRuntimeConfigForTest } from '../config/runtime'
import { resetServersForTest } from '../servers/registry'
import { hostConsoleInfo, hostConsoleUrl, openHostConsole } from './hostConsole'

// Same harness as monitoringPortal.test.ts: tests run in the 'node'
// environment, so stand in a `window` carrying the injected config.js payload.
const originalWindow = (globalThis as { window?: unknown }).window
const open = vi.fn()

function inject(config: unknown): void {
  ;(globalThis as { window?: unknown }).window = { ovirtWebUiConfig: config, open }
  resetRuntimeConfigForTest()
  resetServersForTest()
}

const host = { id: 'host-01', address: 'node-01.example.com' }

beforeEach(() => {
  open.mockClear()
  // The node environment has no sessionStorage; the session's engine binding
  // (setSessionServerBase) lives only there, so give it a per-test store.
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  clearSessionToken()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  clearSessionToken()
  resetRuntimeConfigForTest()
  resetServersForTest()
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
})

describe('direct mode (default)', () => {
  it('opens the host on port 9090 with no config', () => {
    inject(undefined)
    expect(hostConsoleInfo(host)).toEqual({
      mode: 'direct',
      displayUrl: 'https://node-01.example.com:9090',
    })
    expect(hostConsoleUrl(host)).toBe('https://node-01.example.com:9090')
  })

  it('honors a configured port', () => {
    inject({ cockpit: { port: 9443 } })
    expect(hostConsoleUrl(host)).toBe('https://node-01.example.com:9443')
  })

  it('brackets an IPv6 address', () => {
    inject(undefined)
    expect(hostConsoleUrl({ id: 'h', address: 'fd00::12' })).toBe('https://[fd00::12]:9090')
  })

  it('accepts an IPv4 address', () => {
    inject(undefined)
    expect(hostConsoleUrl({ id: 'h', address: '10.0.0.12' })).toBe('https://10.0.0.12:9090')
  })

  it('is unavailable without an address', () => {
    inject(undefined)
    expect(hostConsoleInfo({ id: 'h' })).toBeUndefined()
    expect(hostConsoleInfo({ id: 'h', address: '   ' })).toBeUndefined()
    expect(hostConsoleUrl({ id: 'h' })).toBeUndefined()
  })

  it('refuses an address that smuggles URL syntax', () => {
    inject(undefined)
    for (const address of ['evil.example/path', 'user@evil.example', 'a b', 'x?y=1', 'x#frag']) {
      expect(hostConsoleInfo({ id: 'h', address })).toBeUndefined()
    }
  })

  it('is unavailable when the deployer disables the feature', () => {
    inject({ cockpit: { enabled: false, ssoUrl: 'https://engine.example.com:9986' } })
    expect(hostConsoleInfo(host)).toBeUndefined()
    expect(openHostConsole(host)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('opens a new tab with the opener severed', () => {
    inject(undefined)
    expect(openHostConsole(host)).toBe(true)
    expect(open).toHaveBeenCalledWith(
      'https://node-01.example.com:9090',
      '_blank',
      'noopener,noreferrer',
    )
  })
})

describe('sso mode', () => {
  it('hands the session token to the configured service in the fragment', () => {
    inject({ cockpit: { ssoUrl: 'https://engine.example.com:9986' } })
    setSessionToken('tok/en+1')
    expect(hostConsoleInfo(host)).toEqual({
      mode: 'sso',
      displayUrl: 'https://engine.example.com:9986',
    })
    expect(hostConsoleUrl(host)).toBe(
      'https://engine.example.com:9986/=host-01/machines#access_token=tok%2Fen%2B1',
    )
  })

  it('never puts the token in the render-time info', () => {
    inject({ cockpit: { ssoUrl: 'https://engine.example.com:9986' } })
    setSessionToken('secret-token')
    expect(JSON.stringify(hostConsoleInfo(host))).not.toContain('secret-token')
  })

  it('honors a configured landing page', () => {
    inject({ cockpit: { ssoUrl: 'https://engine.example.com:9986', ssoPage: 'system' } })
    setSessionToken('t')
    expect(hostConsoleUrl(host)).toBe(
      'https://engine.example.com:9986/=host-01/system#access_token=t',
    )
  })

  it('works for a host without an address (the service resolves the host by id)', () => {
    inject({ cockpit: { ssoUrl: 'https://engine.example.com:9986' } })
    setSessionToken('t')
    expect(hostConsoleUrl({ id: 'host-09' })).toBe(
      'https://engine.example.com:9986/=host-09/machines#access_token=t',
    )
  })

  it('falls back to the direct link when the session has no token', () => {
    inject({ cockpit: { ssoUrl: 'https://engine.example.com:9986' } })
    expect(hostConsoleUrl(host)).toBe('https://node-01.example.com:9090')
  })

  it('ignores a plaintext or malformed SSO URL and stays direct', () => {
    for (const ssoUrl of ['http://engine.example.com:9986', 'javascript:alert(1)', 'engine:9986']) {
      inject({ cockpit: { ssoUrl } })
      setSessionToken('t')
      expect(hostConsoleInfo(host)?.mode).toBe('direct')
    }
  })
})

describe('sso mode on a multi-engine deploy', () => {
  beforeEach(() => vi.stubEnv('VITE_MULTI_ENGINE', '1'))

  const servers = {
    list: [
      { name: 'HE 1', url: '/e/he1', cockpitSsoUrl: 'https://engine1.example.com:9986' },
      { name: 'HE 2', url: '/e/he2' },
    ],
  }

  it("uses the session engine's own SSO service", () => {
    inject({ servers })
    setSessionToken('t')
    setSessionServerBase('/e/he1')
    expect(hostConsoleUrl(host)).toBe(
      'https://engine1.example.com:9986/=host-01/machines#access_token=t',
    )
  })

  it('never sends the token to the single-engine ssoUrl or another engine', () => {
    inject({ servers, cockpit: { ssoUrl: 'https://engine1.example.com:9986' } })
    setSessionToken('t')
    setSessionServerBase('/e/he2')
    expect(hostConsoleInfo(host)?.mode).toBe('direct')
    expect(hostConsoleUrl(host)).toBe('https://node-01.example.com:9090')
  })
})
