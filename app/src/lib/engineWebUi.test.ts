import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeConfigForTest } from '../config/runtime'
import { resetServersForTest } from '../servers/registry'
import { engineWebUiUrl } from './engineWebUi'

// Same harness as config/runtime.test.ts: tests run in the 'node' environment,
// so stand in a `window` carrying the injected config.js payload.
const originalWindow = (globalThis as { window?: unknown }).window

function inject(config: unknown): void {
  ;(globalThis as { window?: unknown }).window = { ovirtWebUiConfig: config }
  resetRuntimeConfigForTest()
  resetServersForTest()
}

// The server list only populates on the multi-engine build (the Containerfile's
// proxy/external build); the integrated RPM compiles the capability out.
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

describe('engineWebUiUrl', () => {
  it('prefers the configured Hosted Engine fqdn over the console origin', () => {
    inject({
      servers: {
        list: [{ name: 'HE 1', url: '/e/cosite', fqdn: 'lcositeoravirt01.cos.is.keysight.com' }],
      },
    })
    // NOT the console's own origin, and not the '/e/<slug>' proxy path — the
    // engine UI is served by the engine itself.
    expect(engineWebUiUrl()).toBe('https://lcositeoravirt01.cos.is.keysight.com/ovirt-engine/')
  })

  it('trims a padded fqdn', () => {
    inject({ servers: { list: [{ name: 'HE 1', url: '/e/a', fqdn: '  engine.example.com  ' }] } })
    expect(engineWebUiUrl()).toBe('https://engine.example.com/ovirt-engine/')
  })

  it('rebases onto the active base when no fqdn is configured', () => {
    inject({ servers: { list: [{ name: 'HE 2', url: '/e/he2' }] } })
    expect(engineWebUiUrl()).toBe('/e/he2/ovirt-engine/')
  })

  it('stays a same-origin path on the integrated single-engine deploy', () => {
    // no servers configured at all → active base is '' (the console IS the engine)
    inject(undefined)
    expect(engineWebUiUrl()).toBe('/ovirt-engine/')
  })
})
