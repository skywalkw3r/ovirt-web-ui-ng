import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fresh module copies per test (vi.resetModules + dynamic import): the
// registry memoizes the resolved active base and the session module caches
// its token at import, so stale module state would leak between cases.

const CONSOLE_ORIGIN = 'https://console.example'

const TWO_SERVERS = {
  servers: {
    list: [
      { name: 'HE 1', url: 'https://engine1.example' },
      { name: 'HE 2', url: 'https://engine2.example' },
    ],
  },
}

function stubStorages() {
  const local = new Map<string, string>()
  const session = new Map<string, string>()
  const asStorage = (store: Map<string, string>) => ({
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  vi.stubGlobal('localStorage', asStorage(local))
  vi.stubGlobal('sessionStorage', asStorage(session))
  return { local, session }
}

function stubWindow(config: unknown) {
  vi.stubGlobal('window', { ovirtWebUiConfig: config, location: { origin: CONSOLE_ORIGIN } })
}

async function loadRegistry() {
  return import('./registry')
}

describe('servers registry', () => {
  beforeEach(() => {
    vi.resetModules()
    // the registry tests exercise the multi-engine-capable build
    vi.stubEnv('VITE_MULTI_ENGINE', '1')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('defaults to same-origin with no servers configured', async () => {
    stubStorages()
    stubWindow(undefined)
    const registry = await loadRegistry()
    expect(registry.getServers()).toEqual([])
    expect(registry.getActiveBase()).toBe('')
    expect(registry.getActiveServer()).toBeNull()
  })

  it('defaults to the first configured server', async () => {
    stubStorages()
    stubWindow(TWO_SERVERS)
    const registry = await loadRegistry()
    expect(registry.getActiveBase()).toBe('https://engine1.example')
    expect(registry.getActiveServer()?.name).toBe('HE 1')
  })

  it('collapses a server at the page origin to the same-origin base', async () => {
    stubStorages()
    stubWindow({
      servers: {
        list: [
          { name: 'Local', url: CONSOLE_ORIGIN },
          { name: 'HE 2', url: 'https://engine2.example' },
        ],
      },
    })
    const registry = await loadRegistry()
    expect(registry.getServers()[0]).toEqual({ name: 'Local', base: '' })
    expect(registry.getActiveBase()).toBe('')
    expect(registry.getActiveServer()?.name).toBe('Local')
  })

  it('honors the remembered last pick when it is still configured', async () => {
    const { local } = stubStorages()
    local.set('console-active-server', 'https://engine2.example')
    stubWindow(TWO_SERVERS)
    const registry = await loadRegistry()
    expect(registry.getActiveBase()).toBe('https://engine2.example')
  })

  it('falls back to the first server when the remembered pick vanished from config', async () => {
    const { local } = stubStorages()
    local.set('console-active-server', 'https://gone.example')
    stubWindow(TWO_SERVERS)
    const registry = await loadRegistry()
    expect(registry.getActiveBase()).toBe('https://engine1.example')
  })

  it("adopts a live session's engine over the remembered pick", async () => {
    const { local, session } = stubStorages()
    local.set('console-active-server', 'https://engine1.example')
    session.set('console-session-token', 'tok-123')
    session.set('console-session-server', 'https://engine2.example')
    stubWindow(TWO_SERVERS)
    const registry = await loadRegistry()
    expect(registry.getActiveBase()).toBe('https://engine2.example')
  })

  it('discards a session bound to a deconfigured engine instead of retargeting it', async () => {
    const { session } = stubStorages()
    session.set('console-session-token', 'tok-123')
    session.set('console-session-username', 'admin')
    session.set('console-session-server', 'https://gone.example')
    stubWindow(TWO_SERVERS)
    const registry = await loadRegistry()
    const sessionModule = await import('../api/session')
    expect(registry.getActiveBase()).toBe('https://engine1.example')
    // the token must never ride to a different engine than it was issued by
    expect(sessionModule.getSessionToken()).toBeNull()
    expect(session.get('console-session-token')).toBeUndefined()
  })

  it('setActiveBase persists a configured pick and ignores foreign bases', async () => {
    const { local } = stubStorages()
    stubWindow(TWO_SERVERS)
    const registry = await loadRegistry()
    registry.setActiveBase('https://engine2.example')
    expect(registry.getActiveBase()).toBe('https://engine2.example')
    expect(local.get('console-active-server')).toBe('https://engine2.example')
    registry.setActiveBase('https://evil.example')
    expect(registry.getActiveBase()).toBe('https://engine2.example')
  })

  it('rebase prefixes same-origin paths with the active base and passes absolutes through', async () => {
    stubStorages()
    stubWindow(TWO_SERVERS)
    const registry = await loadRegistry()
    expect(registry.rebase('/ovirt-engine-grafana')).toBe(
      'https://engine1.example/ovirt-engine-grafana',
    )
    expect(registry.rebase('https://grafana.example')).toBe('https://grafana.example')
    registry.setActiveBase('https://engine2.example')
    expect(registry.rebase('/ovirt-engine-grafana')).toBe(
      'https://engine2.example/ovirt-engine-grafana',
    )
  })

  it('rebase is a no-op on the same-origin base', async () => {
    stubStorages()
    stubWindow(undefined)
    const registry = await loadRegistry()
    expect(registry.rebase('/ovirt-engine-grafana')).toBe('/ovirt-engine-grafana')
  })
})
