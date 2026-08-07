import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearMotdDismissal, dismissMotd, motdSignature, readDismissedMotd } from './motd'
import type { MotdConfig } from '../config/runtime'

// In-memory sessionStorage stand-in (the vitest environment is node), same as
// api/session.test.ts. Node's OWN sessionStorage global is version-dependent —
// node 24 (the CI pin) silently no-ops it without --localstorage-file so the
// round-trip read returns null, while node 26 stores in memory — so the test
// must not lean on the runtime's global.
function stubSessionStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

const base: MotdConfig = { severity: 'info', title: 'Maintenance', message: 'Back at 04:00.' }

describe('motdSignature', () => {
  it('tracks every visible field, so an edited announcement resurfaces', () => {
    const sig = motdSignature(base)
    expect(motdSignature({ ...base, message: 'Back at 05:00.' })).not.toBe(sig)
    expect(motdSignature({ ...base, title: 'Outage' })).not.toBe(sig)
    expect(motdSignature({ ...base, severity: 'danger' })).not.toBe(sig)
  })

  it('is stable for identical content', () => {
    expect(motdSignature({ ...base })).toBe(motdSignature(base))
  })

  it('separates fields so a boundary shift cannot collide', () => {
    expect(motdSignature({ ...base, title: 'ab', message: '' })).not.toBe(
      motdSignature({ ...base, title: 'a', message: 'b' }),
    )
  })
})

describe('dismissal', () => {
  beforeEach(() => {
    stubSessionStorage()
    clearMotdDismissal()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips the dismissed signature and clears on demand', () => {
    expect(readDismissedMotd()).toBeNull()
    dismissMotd(motdSignature(base))
    expect(readDismissedMotd()).toBe(motdSignature(base))
    // AuthProvider.login() calls this so the banner returns at every sign-in
    clearMotdDismissal()
    expect(readDismissedMotd()).toBeNull()
  })
})
