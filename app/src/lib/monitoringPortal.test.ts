import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTest } from '../config/runtime'
import { resetServersForTest } from '../servers/registry'
import { monitoringPortalUrl, showMonitoringPortal } from './monitoringPortal'

// Same harness as engineWebUi.test.ts: tests run in the 'node' environment,
// so stand in a `window` carrying the injected config.js payload.
const originalWindow = (globalThis as { window?: unknown }).window

function inject(config: unknown): void {
  ;(globalThis as { window?: unknown }).window = { ovirtWebUiConfig: config }
  resetRuntimeConfigForTest()
  resetServersForTest()
}

beforeEach(() => vi.stubEnv('VITE_MULTI_ENGINE', '1'))

afterEach(() => {
  vi.unstubAllEnvs()
  resetRuntimeConfigForTest()
  resetServersForTest()
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window
  } else {
    ;(globalThis as { window?: unknown }).window = originalWindow
  }
})

describe('monitoringPortalUrl', () => {
  it('opens the engine host, not the console proxy path, on a multi-engine deploy', () => {
    inject({
      servers: { list: [{ name: 'HE 1', url: '/e/he1', fqdn: 'engine1.example.com' }] },
    })
    expect(monitoringPortalUrl()).toBe('https://engine1.example.com/ovirt-engine-grafana')
  })

  it('uses an absolute grafanaBaseUrl verbatim', () => {
    inject({ monitoring: { grafanaBaseUrl: 'https://grafana.example.com' } })
    expect(monitoringPortalUrl()).toBe('https://grafana.example.com')
  })

  it('stays a same-origin path on the integrated single-engine deploy', () => {
    inject(undefined)
    expect(monitoringPortalUrl()).toBe('/ovirt-engine-grafana')
  })
})

describe('showMonitoringPortal', () => {
  it('shows the links to admins by default', () => {
    inject(undefined)
    expect(showMonitoringPortal(true)).toBe(true)
  })

  it('never shows them to non-admins', () => {
    inject(undefined)
    expect(showMonitoringPortal(false)).toBe(false)
  })

  it('hides them everywhere once config.js sets enabled: false', () => {
    inject({ monitoring: { enabled: false } })
    expect(showMonitoringPortal(true)).toBe(false)
  })
})
