import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory sessionStorage stand-in (the vitest environment is node): the
// module under test degrades to memory-only without one, so the tier-hint
// tests stub a real-enough store before importing a fresh module copy.
function stubSessionStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

describe('session tier hint', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('re-seeds a server-verified admin tier stored beside a restored token', async () => {
    const store = stubSessionStorage()
    store.set('console-session-token', 'tok-123')
    store.set('console-session-tier', 'admin')
    const session = await import('./session')
    expect(session.isSessionAdmin()).toBe(true)
  })

  it('stays least-privilege when no token was restored', async () => {
    const store = stubSessionStorage()
    store.set('console-session-tier', 'admin')
    const session = await import('./session')
    expect(session.isSessionAdmin()).toBe(false)
  })

  it('persists the tier beside the token and clears both together', async () => {
    const store = stubSessionStorage()
    const session = await import('./session')
    session.setSessionToken('tok-123')
    session.setSessionAdmin(true)
    expect(store.get('console-session-tier')).toBe('admin')
    session.clearSessionToken()
    expect(store.get('console-session-tier')).toBeUndefined()
    expect(session.isSessionAdmin()).toBe(false)
  })
})
