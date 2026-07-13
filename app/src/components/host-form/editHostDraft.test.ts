import { describe, expect, it } from 'vitest'
import { HostSchema, type Host } from '../../api/schemas/host'
import { draftToPayload, hostToDraft, type PmProxyType } from './editHostDraft'

// Build a host through the real schema so pm_proxies exercises the looseObject
// passthrough (power_management is not statically typed for it) — the same path
// hostToDraft reads it back through.
function host(powerManagement?: Record<string, unknown>): Host {
  return HostSchema.parse({ id: 'h1', name: 'node-1', power_management: powerManagement })
}

describe('hostToDraft fence proxies', () => {
  it('reads the ordered proxy preference off the host', () => {
    const draft = hostToDraft(
      host({ enabled: true, pm_proxies: { pm_proxy: [{ type: 'dc' }, { type: 'cluster' }] } }),
    )
    expect(draft.pmProxies).toEqual(['dc', 'cluster'])
  })

  it('defaults to an empty list and drops unrecognised proxy types', () => {
    expect(hostToDraft(host({ enabled: true })).pmProxies).toEqual([])
    const draft = hostToDraft(
      host({ pm_proxies: { pm_proxy: [{ type: 'bogus' }, { type: 'other_dc' }] } }),
    )
    expect(draft.pmProxies).toEqual(['other_dc'])
  })
})

describe('draftToPayload fence proxies', () => {
  it('sends pm_proxies (in order) only when the preference changed', () => {
    const seed = hostToDraft(
      host({ enabled: true, pm_proxies: { pm_proxy: [{ type: 'cluster' }, { type: 'dc' }] } }),
    )
    const draft = { ...seed, pmProxies: ['dc', 'cluster'] as PmProxyType[] }
    const payload = draftToPayload(draft, seed)
    expect(payload.power_management).toEqual({
      enabled: true,
      kdump_detection: true,
      automatic_pm_enabled: true,
      pm_proxies: { pm_proxy: [{ type: 'dc' }, { type: 'cluster' }] },
    })
  })

  it('omits pm_proxies when only a power-management flag changed', () => {
    const seed = hostToDraft(
      host({ enabled: false, pm_proxies: { pm_proxy: [{ type: 'cluster' }] } }),
    )
    const payload = draftToPayload({ ...seed, pmEnabled: true }, seed) as {
      power_management?: Record<string, unknown>
    }
    expect(payload.power_management).toBeDefined()
    expect(payload.power_management?.pm_proxies).toBeUndefined()
  })

  it('emits no power_management block when nothing power-related changed', () => {
    const seed = hostToDraft(
      host({ enabled: true, pm_proxies: { pm_proxy: [{ type: 'cluster' }] } }),
    )
    expect(draftToPayload({ ...seed }, seed).power_management).toBeUndefined()
  })
})
