import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeConfig, resetRuntimeConfigForTest } from './runtime'

// The plugins block is the extension allow-list (docs/PLUGINS.md). Same
// node-environment stand-in for `window` as runtime.test.ts, plus a page
// origin, which manifest paths resolve against.
const originalWindow = (globalThis as { window?: unknown }).window

function injectAt(config: unknown): void {
  ;(globalThis as { window?: unknown }).window = {
    location: { origin: 'https://console.example.com' },
    ovirtWebUiConfig: config,
  }
  resetRuntimeConfigForTest()
}

afterEach(() => {
  resetRuntimeConfigForTest()
  vi.restoreAllMocks()
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window
  else (globalThis as { window?: unknown }).window = originalWindow
})

describe('getRuntimeConfig plugins', () => {
  it('is off with an empty allow-list by default', () => {
    injectAt(undefined)
    expect(getRuntimeConfig().plugins).toEqual({ enabled: false, list: [] })
  })

  it('loads nothing unless enabled is exactly true, even with a list', () => {
    const list = [{ name: 'a', manifest: '/plugins/a/manifest.json' }]
    for (const enabled of [undefined, false, 'true', 1]) {
      injectAt({ plugins: { enabled, list } })
      expect(getRuntimeConfig().plugins).toEqual({ enabled: false, list: [] })
    }
  })

  it('resolves manifests and keeps the servers filter', () => {
    injectAt({
      plugins: {
        enabled: true,
        list: [
          { name: 'a', manifest: '/plugins/a/manifest.json' },
          { name: 'b', manifest: 'https://cdn.example.org/b/manifest.json', servers: [' HE 1 '] },
        ],
      },
    })
    expect(getRuntimeConfig().plugins).toEqual({
      enabled: true,
      list: [
        { name: 'a', manifest: 'https://console.example.com/plugins/a/manifest.json' },
        { name: 'b', manifest: 'https://cdn.example.org/b/manifest.json', servers: ['HE 1'] },
      ],
    })
  })

  it('drops invalid and duplicate entries one by one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    injectAt({
      plugins: {
        enabled: true,
        list: [
          { name: 'Bad Name', manifest: '/plugins/x/manifest.json' },
          { name: 'http', manifest: 'http://cdn.example.org/manifest.json' },
          { name: 'proto', manifest: '//evil.example/manifest.json' },
          { name: 'nomanifest' },
          'not-an-object',
          { name: 'ok', manifest: '/plugins/ok/manifest.json' },
          { name: 'ok', manifest: '/plugins/other/manifest.json' },
        ],
      },
    })
    expect(getRuntimeConfig().plugins.list.map((entry) => entry.manifest)).toEqual([
      'https://console.example.com/plugins/ok/manifest.json',
    ])
    expect(warn).toHaveBeenCalledTimes(6)
  })

  it('a malformed plugins block disables plugins without breaking other config', () => {
    injectAt({ plugins: { enabled: true, list: 'nope' }, login: { notice: 'kept' } })
    expect(getRuntimeConfig().plugins.enabled).toBe(false)
    expect(getRuntimeConfig().login.notice).toBe('kept')
  })
})
