import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The transport is the only way a plugin reaches the engine; mock it so the
// test can see exactly what a plugin call forwards.
const request = vi.fn(async (path: string, opts: unknown) => ({ path, opts }))
vi.mock('../api/transport', () => ({ request }))

const { resetRuntimeConfigForTest } = await import('../config/runtime')
const { resetServersForTest } = await import('../servers/registry')
const { getExtensionSnapshot, resetExtensionsForTest } = await import('./registry')
const { resetLoaderForTest, startExtensions } = await import('./loader')
const { resetBridgeForTest, updateBridge } = await import('./bridge')
type LoaderDeps = import('./loader').LoaderDeps
type ExtensionApi = import('./api').ExtensionApi

const ORIGIN = 'https://console.example.com'
const originalWindow = (globalThis as { window?: unknown }).window

function configure(plugins: unknown, extra: Record<string, unknown> = {}): void {
  ;(globalThis as { window?: unknown }).window = {
    location: { origin: ORIGIN },
    ovirtWebUiConfig: { plugins, ...extra },
  }
  resetRuntimeConfigForTest()
  resetServersForTest()
}

const manifestFor = (name: string) => ({
  name,
  version: '1.2.3',
  displayName: name.toUpperCase(),
  apiVersion: 1,
  entry: './index.js',
})

const Noop = () => null

// Fake network: manifests and modules keyed by URL.
function deps(
  modules: Record<string, unknown>,
  manifests: Record<string, unknown> = {},
): LoaderDeps & { imported: string[] } {
  const imported: string[] = []
  return {
    imported,
    fetchJson: async (url) => {
      if (url in manifests) return manifests[url]
      const name = url.match(/plugins\/([^/]+)\//)?.[1]
      if (name === undefined) throw new Error('manifest request failed (HTTP 404)')
      return manifestFor(name)
    },
    importModule: async (url) => {
      imported.push(url)
      if (!(url in modules)) throw new Error(`no module at ${url}`)
      return modules[url]
    },
    installShared: async () => {},
    timeouts: { manifest: 200, entry: 200, activate: 200 },
  }
}

const entry = (name: string) => `${ORIGIN}/plugins/${name}/index.js`

beforeEach(() => {
  resetExtensionsForTest()
  resetLoaderForTest()
  resetBridgeForTest()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  request.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetRuntimeConfigForTest()
  resetServersForTest()
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window
  else (globalThis as { window?: unknown }).window = originalWindow
})

describe('startExtensions', () => {
  it('loads nothing while the feature flag is off', async () => {
    configure({ list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    const fake = deps({})
    await startExtensions(fake)
    expect(fake.imported).toEqual([])
    expect(getExtensionSnapshot().plugins).toEqual([])
  })

  it('activates an allow-listed plugin and commits its contributions', async () => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    const fake = deps({
      [entry('a')]: {
        activate(api: ExtensionApi) {
          api.registerEntityTab({ entity: 'host', id: 'notes', title: 'Notes', component: Noop })
          api.registerAction({ entity: 'vm', id: 'ping', label: 'Ping', run: () => {} })
          api.registerNavPage({ id: 'home', title: 'Home', component: Noop })
          api.registerDashboardCard({ id: 'card', title: 'Card', component: Noop, size: 'small' })
        },
      },
    })
    await startExtensions(fake)
    const snap = getExtensionSnapshot()
    expect(snap.plugins).toEqual([
      expect.objectContaining({
        name: 'a',
        status: 'active',
        version: '1.2.3',
        displayName: 'A',
        origin: ORIGIN,
      }),
    ])
    expect(snap.entityTabs.map((t) => t.key)).toEqual(['a:notes'])
    expect(snap.actions.map((t) => [t.key, t.contribution.placement])).toEqual([
      ['a:ping', ['kebab']],
    ])
    expect(snap.navPages.map((t) => t.key)).toEqual(['a:home'])
    expect(snap.dashboardCards.map((t) => t.key)).toEqual(['a:card'])
  })

  it('loads only what is allow-listed: an unlisted plugin never loads', async () => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    const fake = deps({ [entry('a')]: { activate() {} }, [entry('b')]: { activate() {} } })
    await startExtensions(fake)
    expect(fake.imported).toEqual([entry('a')])
    expect(getExtensionSnapshot().plugins.map((p) => p.name)).toEqual(['a'])
  })

  it('rolls back every registration when activate() throws, and keeps other plugins', async () => {
    configure({
      enabled: true,
      list: [
        { name: 'bad', manifest: '/plugins/bad/manifest.json' },
        { name: 'good', manifest: '/plugins/good/manifest.json' },
      ],
    })
    const fake = deps({
      [entry('bad')]: {
        activate(api: ExtensionApi) {
          api.registerEntityTab({ entity: 'host', id: 'x', title: 'X', component: Noop })
          throw new Error('boom')
        },
      },
      [entry('good')]: {
        activate(api: ExtensionApi) {
          api.registerEntityTab({ entity: 'host', id: 'y', title: 'Y', component: Noop })
        },
      },
    })
    await startExtensions(fake)
    const snap = getExtensionSnapshot()
    expect(snap.entityTabs.map((t) => t.key)).toEqual(['good:y'])
    expect(snap.plugins.find((p) => p.name === 'bad')).toMatchObject({
      status: 'failed',
      error: 'activate() failed: boom',
    })
    expect(snap.plugins.find((p) => p.name === 'good')?.status).toBe('active')
  })

  it('rolls back an async activate() that rejects', async () => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    await startExtensions(
      deps({
        [entry('a')]: {
          async activate(api: ExtensionApi) {
            api.registerNavPage({ id: 'p', title: 'P', component: Noop })
            await Promise.resolve()
            throw new Error('later')
          },
        },
      }),
    )
    expect(getExtensionSnapshot().navPages).toEqual([])
    expect(getExtensionSnapshot().plugins[0].status).toBe('failed')
  })

  it.each([
    ['a module without activate()', { default: {} }, 'does not export activate()'],
    ['a module that fails to import', undefined, 'entry module failed to load'],
  ])('marks %s failed', async (_label, module, error) => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    await startExtensions(deps(module === undefined ? {} : { [entry('a')]: module }))
    expect(getExtensionSnapshot().plugins[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining(error),
    })
  })

  it('fails a manifest whose name does not match, without importing anything', async () => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    const fake = deps(
      { [entry('a')]: { activate() {} } },
      { [`${ORIGIN}/plugins/a/manifest.json`]: manifestFor('impostor') },
    )
    await startExtensions(fake)
    expect(fake.imported).toEqual([])
    expect(getExtensionSnapshot().plugins[0].error).toContain('does not match')
  })

  it('times out a hung entry module', async () => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    const fake = deps({})
    fake.importModule = () => new Promise(() => {})
    await startExtensions(fake)
    expect(getExtensionSnapshot().plugins[0].error).toContain('timed out')
  })

  it('rejects invalid registrations as an activation failure', async () => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    await startExtensions(
      deps({
        [entry('a')]: {
          activate(api: ExtensionApi) {
            api.registerEntityTab({ entity: 'host', id: 'Bad Id', title: 'X', component: Noop })
          },
        },
      }),
    )
    expect(getExtensionSnapshot().plugins[0].error).toContain('id must match')
  })

  it('rejects a duplicate id and an unknown entity or placement', async () => {
    configure({
      enabled: true,
      list: [
        { name: 'dup', manifest: '/plugins/dup/manifest.json' },
        { name: 'kind', manifest: '/plugins/kind/manifest.json' },
        { name: 'place', manifest: '/plugins/place/manifest.json' },
      ],
    })
    await startExtensions(
      deps({
        [entry('dup')]: {
          activate(api: ExtensionApi) {
            api.registerNavPage({ id: 'x', title: 'X', component: Noop })
            api.registerDashboardCard({ id: 'x', title: 'X', component: Noop })
          },
        },
        [entry('kind')]: {
          activate(api: ExtensionApi) {
            api.registerAction({ entity: 'cluster' as never, id: 'x', label: 'X', run: () => {} })
          },
        },
        [entry('place')]: {
          activate(api: ExtensionApi) {
            api.registerAction({
              entity: 'vm',
              id: 'x',
              label: 'X',
              placement: ['toolbar' as never],
              run: () => {},
            })
          },
        },
      }),
    )
    const errors = Object.fromEntries(
      getExtensionSnapshot().plugins.map((plugin) => [plugin.name, plugin.error]),
    )
    expect(errors.dup).toContain('already registered')
    expect(errors.kind).toContain('entity must be one of')
    expect(errors.place).toContain('placement must list')
  })

  it('skips a plugin whose servers filter does not name the session engine', async () => {
    configure({
      enabled: true,
      list: [{ name: 'a', manifest: '/plugins/a/manifest.json', servers: ['HE 2'] }],
    })
    const fake = deps({ [entry('a')]: { activate() {} } })
    await startExtensions(fake)
    expect(fake.imported).toEqual([])
    expect(getExtensionSnapshot().plugins[0].status).toBe('skipped')
  })

  it('attempts each plugin once per page load', async () => {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    const fake = deps({ [entry('a')]: { activate() {} } })
    await startExtensions(fake)
    await startExtensions(fake)
    expect(fake.imported).toEqual([entry('a')])
  })
})

describe('the ExtensionApi services', () => {
  async function activeApi(): Promise<ExtensionApi> {
    configure({ enabled: true, list: [{ name: 'a', manifest: '/plugins/a/manifest.json' }] })
    let captured: ExtensionApi | undefined
    await startExtensions(
      deps({
        [entry('a')]: {
          activate(api: ExtensionApi) {
            captured = api
          },
        },
      }),
    )
    return captured!
  }

  it('reaches the engine only through the transport, forwarding no headers', async () => {
    const api = await activeApi()
    const signal = new AbortController().signal
    await api.engine.request('/hosts/1', {
      method: 'POST',
      body: { a: 1 },
      signal,
      headers: { Authorization: 'Bearer stolen', Filter: 'false' },
    } as never)
    expect(request).toHaveBeenCalledWith('/hosts/1', { method: 'POST', body: { a: 1 }, signal })
  })

  it('refuses paths that climb out of the API, and unknown methods', async () => {
    const api = await activeApi()
    await expect(api.engine.request('/../sso/oauth/token')).rejects.toMatchObject({ status: 0 })
    await expect(api.engine.request('https://evil.example/x')).rejects.toThrow('refused path')
    await expect(api.engine.request('/hosts', { method: 'PATCH' as never })).rejects.toThrow(
      'refused method',
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('navigates only to in-app paths', async () => {
    const api = await activeApi()
    const navigate = vi.fn()
    updateBridge({ navigate })
    api.navigate('/hosts/1')
    expect(navigate).toHaveBeenCalledWith('/hosts/1')
    expect(() => api.navigate('//evil.example')).toThrow('refused path')
    expect(api.navPagePath('home')).toBe('/extensions/a/home')
  })

  it('formats its own messages in the bridge locale and exposes the session read-only', async () => {
    const api = await activeApi()
    updateBridge({ locale: 'de', userName: 'admin@internal', isAdmin: true })
    api.i18n.registerMessages({ en: { hi: 'Hi {who}' }, de: { hi: 'Hallo {who}' } })
    expect(api.i18n.format('hi', { who: 'Ada' })).toBe('Hallo Ada')
    expect(api.i18n.message('hi')).toEqual({ messageId: 'hi' })
    expect(api.session).toEqual({
      userName: 'admin@internal',
      tier: 'admin',
      isAdmin: true,
      engineName: null,
    })
    expect(Object.isFrozen(api)).toBe(true)
    expect(api.version.api).toBe(1)
  })

  it('routes notifications through the bridge', async () => {
    const api = await activeApi()
    const notify = vi.fn()
    updateBridge({ notify })
    api.notify.success('Done')
    api.notify.danger('Broken')
    expect(notify.mock.calls).toEqual([
      ['Done', 'success'],
      ['Broken', 'danger'],
    ])
  })

  it('commits registrations made after activate() returned', async () => {
    const api = await activeApi()
    api.registerEntityTab({ entity: 'disk', id: 'late', title: 'Late', component: Noop })
    expect(getExtensionSnapshot().entityTabs.map((t) => t.key)).toEqual(['a:late'])
  })
})
