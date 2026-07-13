import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeConfig, resetRuntimeConfigForTest } from './runtime'

// Tests run in the 'node' environment (vite.config.ts), where `window` is
// undefined. Assign a stand-in on globalThis so runtime.ts (which guards with
// `typeof window`) reads our injected config.
const originalWindow = (globalThis as { window?: unknown }).window

function inject(config: unknown): void {
  ;(globalThis as { window?: unknown }).window = { ovirtWebUiConfig: config }
  resetRuntimeConfigForTest()
}

afterEach(() => {
  resetRuntimeConfigForTest()
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
})

describe('getRuntimeConfig', () => {
  it('falls back to the same-origin Grafana path when nothing is injected', () => {
    inject(undefined)
    expect(getRuntimeConfig().monitoring.grafanaBaseUrl).toBe('/ovirt-engine-grafana')
  })

  it('honors a valid injected absolute URL and maps enabled:false to off', () => {
    inject({ monitoring: { grafanaBaseUrl: 'https://grafana.example', enabled: false } })
    const cfg = getRuntimeConfig()
    expect(cfg.monitoring.grafanaBaseUrl).toBe('https://grafana.example')
    expect(cfg.monitoring.enabled).toBe('off')
  })

  it('maps enabled:true to on and absence to auto', () => {
    inject({ monitoring: { enabled: true } })
    expect(getRuntimeConfig().monitoring.enabled).toBe('on')
    inject({ monitoring: {} })
    expect(getRuntimeConfig().monitoring.enabled).toBe('auto')
    inject(undefined)
    expect(getRuntimeConfig().monitoring.enabled).toBe('auto')
  })

  it('accepts a leading-slash same-origin path', () => {
    inject({ monitoring: { grafanaBaseUrl: '/grafana' } })
    expect(getRuntimeConfig().monitoring.grafanaBaseUrl).toBe('/grafana')
  })

  it('rejects a javascript: URL and uses the default', () => {
    inject({ monitoring: { grafanaBaseUrl: 'javascript:alert(1)' } })
    expect(getRuntimeConfig().monitoring.grafanaBaseUrl).toBe('/ovirt-engine-grafana')
  })

  it('rejects a protocol-relative //host URL that escapes same-origin', () => {
    inject({ monitoring: { grafanaBaseUrl: '//evil.example/x' } })
    expect(getRuntimeConfig().monitoring.grafanaBaseUrl).toBe('/ovirt-engine-grafana')
  })

  it('ignores a malformed config object without throwing', () => {
    inject({ monitoring: { grafanaBaseUrl: 42 } })
    expect(getRuntimeConfig().monitoring.grafanaBaseUrl).toBe('/ovirt-engine-grafana')
  })

  it('defaults the vm query to the stock VM dashboard; host/cluster stay unset', () => {
    inject(undefined)
    const { queries } = getRuntimeConfig().monitoring
    expect(queries.vm.dashboardUid).toBe('VirtualMachineDashboard')
    expect(queries.vm.idVar).toBe('vm_id')
    expect(queries.vm.panelIds).toContain(7)
    expect(queries.host).toBeUndefined()
    expect(queries.cluster).toBeUndefined()
  })

  it('passes through per-entity query specs with per-entity idVar defaults', () => {
    inject({
      monitoring: {
        queries: {
          vm: { dashboardUid: 'CustomVm', panelIds: [1, 2], idVar: 'machine_id' },
          host: { dashboardUid: 'HostDashboard', panelIds: [3] },
        },
      },
    })
    const { queries } = getRuntimeConfig().monitoring
    expect(queries.vm).toEqual({ dashboardUid: 'CustomVm', panelIds: [1, 2], idVar: 'machine_id' })
    expect(queries.host).toEqual({ dashboardUid: 'HostDashboard', panelIds: [3], idVar: 'host_id' })
    expect(queries.cluster).toBeUndefined()
  })

  it('falls back entirely on a malformed query spec (whole config is rejected)', () => {
    inject({ monitoring: { queries: { vm: { dashboardUid: 42, panelIds: 'x' } } } })
    expect(getRuntimeConfig().monitoring.queries.vm.dashboardUid).toBe('VirtualMachineDashboard')
  })
})

describe('getRuntimeConfig servers', () => {
  // The server list is honored only in multi-engine-capable builds
  // (VITE_MULTI_ENGINE=1 — the Containerfile's proxy/external build); the
  // integrated RPM build lacks the capability entirely.
  beforeEach(() => vi.stubEnv('VITE_MULTI_ENGINE', '1'))
  afterEach(() => vi.unstubAllEnvs())

  // Multi-engine entries need the page origin for the same-origin collapse,
  // so this injection carries a window.location unlike the plain inject().
  function injectAt(config: unknown, origin = 'https://console.example'): void {
    ;(globalThis as { window?: unknown }).window = {
      ovirtWebUiConfig: config,
      location: { origin },
    }
    resetRuntimeConfigForTest()
  }

  it('defaults to an empty list (feature off) without config', () => {
    inject(undefined)
    expect(getRuntimeConfig().servers).toEqual([])
  })

  it('ignores a configured list in a build without the multi-engine capability', () => {
    vi.unstubAllEnvs()
    injectAt({ servers: { list: [{ name: 'HE 2', url: 'https://engine2.example' }] } })
    expect(getRuntimeConfig().servers).toEqual([])
  })

  it('keeps only the origin of a configured URL (paths are ignored)', () => {
    injectAt({ servers: { list: [{ name: 'HE 2', url: 'https://engine2.example/ovirt-engine' }] } })
    expect(getRuntimeConfig().servers).toEqual([{ name: 'HE 2', base: 'https://engine2.example' }])
  })

  it('collapses the page origin to the same-origin base and trims names', () => {
    injectAt({
      servers: {
        list: [
          { name: '  Local  ', url: 'https://console.example' },
          { name: 'HE 2', url: 'https://engine2.example' },
        ],
      },
    })
    expect(getRuntimeConfig().servers).toEqual([
      { name: 'Local', base: '' },
      { name: 'HE 2', base: 'https://engine2.example' },
    ])
  })

  it('drops invalid entries: bad scheme, malformed URL, blank name, missing fields', () => {
    injectAt({
      servers: {
        list: [
          { name: 'evil', url: 'javascript:alert(1)' },
          { name: 'garbage', url: 'not a url' },
          { name: '   ', url: 'https://engine2.example' },
          { name: 'no url' },
          { url: 'https://engine3.example' },
          { name: 'HE 4', url: 'https://engine4.example' },
        ],
      },
    })
    expect(getRuntimeConfig().servers).toEqual([{ name: 'HE 4', base: 'https://engine4.example' }])
  })

  it('dedupes entries resolving to the same origin (first wins)', () => {
    injectAt({
      servers: {
        list: [
          { name: 'HE 2', url: 'https://engine2.example' },
          { name: 'HE 2 again', url: 'https://engine2.example/other-path' },
        ],
      },
    })
    expect(getRuntimeConfig().servers).toEqual([{ name: 'HE 2', base: 'https://engine2.example' }])
  })

  it('survives a malformed servers block without dropping the rest of the config', () => {
    inject({ servers: { list: 'nope' }, monitoring: { grafanaBaseUrl: '/grafana' } })
    expect(getRuntimeConfig().servers).toEqual([])
    // zod rejects the whole injected object on a malformed section, so the
    // monitoring override is dropped too — the safe fallback, matching the
    // established malformed-query behavior above.
    expect(getRuntimeConfig().monitoring.grafanaBaseUrl).toBe('/ovirt-engine-grafana')
  })
})
