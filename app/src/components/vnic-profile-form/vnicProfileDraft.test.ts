import { describe, expect, it } from 'vitest'
import type { Network } from '../../api/schemas/network'
import type { VnicProfile } from '../../api/schemas/vnic-profile'
import {
  type VnicProfileDraft,
  blankDraft,
  draftToPayload,
  profileToDraft,
  resolveNetworkDcId,
} from './vnicProfileDraft'

// A submittable create-mode draft: the blank defaults plus the two required
// fields the modal gates Save on. Tests override single fields from here so each
// case reads as "blank draft except …".
function createDraft(overrides: Partial<VnicProfileDraft> = {}): VnicProfileDraft {
  return {
    ...blankDraft(),
    name: 'vm-dev',
    networkId: 'net-02',
    ...overrides,
  }
}

describe('draftToPayload — create mode', () => {
  it('sends name/description/pass_through/network plus port_mirroring, omitting unchosen links', () => {
    const payload = draftToPayload(createDraft({ description: 'dev' }), false)
    // On create an unchosen filter/qos is OMITTED (not {}): there is no existing
    // entity to clear, so an empty object would only add noise.
    expect(payload).toEqual({
      name: 'vm-dev',
      description: 'dev',
      pass_through: { mode: 'disabled' },
      network: { id: 'net-02' },
      port_mirroring: false,
    })
    expect(payload).not.toHaveProperty('network_filter')
    expect(payload).not.toHaveProperty('qos')
    expect(payload).not.toHaveProperty('migratable')
  })

  it('sends bare { id } links for a chosen filter and qos', () => {
    const payload = draftToPayload(
      createDraft({ portMirroring: true, networkFilterId: 'nf-clean-traffic', qosId: 'qos-01' }),
      false,
    )
    expect(payload.port_mirroring).toBe(true)
    expect(payload.network_filter).toEqual({ id: 'nf-clean-traffic' })
    expect(payload.qos).toEqual({ id: 'qos-01' })
  })

  it('omits the network on create when none is chosen (Save is gated, but be safe)', () => {
    const payload = draftToPayload(createDraft({ networkId: '' }), false)
    expect(payload).not.toHaveProperty('network')
  })

  it('under passthrough omits filter/qos entirely and rides migratable/failover', () => {
    const payload = draftToPayload(
      createDraft({ passthrough: true, migratable: true, failoverId: 'vnic-02' }),
      false,
    )
    expect(payload.pass_through).toEqual({ mode: 'enabled' })
    expect(payload.port_mirroring).toBe(false)
    expect(payload.migratable).toBe(true)
    expect(payload.failover).toEqual({ id: 'vnic-02' })
    // nothing to clear on create — the excluded links are simply absent
    expect(payload).not.toHaveProperty('network_filter')
    expect(payload).not.toHaveProperty('qos')
  })
})

describe('draftToPayload — edit mode', () => {
  it('omits the create-only network link', () => {
    const payload = draftToPayload(createDraft(), true)
    expect(payload).not.toHaveProperty('network')
  })

  it('sends an explicit empty object to CLEAR a filter/qos the profile already had', () => {
    // The gap this closes: the engine mapper only nulls a link when the key is
    // present-but-id-unset. An omitted key preserves the old value, so clearing
    // to None must send `{}`, not omit. Assert the clear rides on edit.
    const payload = draftToPayload(
      createDraft({ networkFilterId: '', qosId: '', portMirroring: false }),
      true,
    )
    expect(payload.network_filter).toEqual({})
    expect(payload.qos).toEqual({})
    expect(payload.port_mirroring).toBe(false)
  })

  it('still sends bare { id } links when a filter/qos stays selected on edit', () => {
    const payload = draftToPayload(
      createDraft({ networkFilterId: 'nf-clean-traffic', qosId: 'qos-01' }),
      true,
    )
    expect(payload.network_filter).toEqual({ id: 'nf-clean-traffic' })
    expect(payload.qos).toEqual({ id: 'qos-01' })
  })

  it('clears filter/qos with empty objects when passthrough is enabled on edit', () => {
    // Enabling passthrough on an already-filtered/mirrored profile must ship the
    // clears, else the merged entity keeps the old filter/qos and the engine's
    // passthrough validator rejects the update every time.
    const payload = draftToPayload(createDraft({ passthrough: true, migratable: true }), true)
    expect(payload.pass_through).toEqual({ mode: 'enabled' })
    expect(payload.port_mirroring).toBe(false)
    expect(payload.network_filter).toEqual({})
    expect(payload.qos).toEqual({})
    expect(payload.migratable).toBe(true)
  })

  it('sends failover only when migratable and a failover is chosen', () => {
    const withFailover = draftToPayload(
      createDraft({ passthrough: true, migratable: true, failoverId: 'vnic-02' }),
      true,
    )
    expect(withFailover.failover).toEqual({ id: 'vnic-02' })

    // migratable off → no failover key at all (the field is hidden in the UI)
    const notMigratable = draftToPayload(
      createDraft({ passthrough: true, migratable: false, failoverId: 'vnic-02' }),
      true,
    )
    expect(notMigratable).not.toHaveProperty('failover')
  })

  it('does NOT emit a failover clear — removal is a known unwired engine limitation', () => {
    // The engine mapper's failover branch has no null path, so an empty-object
    // clear would be silently ignored. The modal must therefore never present a
    // clear as effective; this asserts the payload contract documents that by
    // simply omitting failover when none is chosen (no `{}` clear is sent).
    const payload = draftToPayload(
      createDraft({ passthrough: true, migratable: true, failoverId: '' }),
      true,
    )
    expect(payload).not.toHaveProperty('failover')
  })
})

describe('profileToDraft', () => {
  it('maps a fully populated passthrough profile onto the draft', () => {
    const profile: VnicProfile = {
      id: 'vnic-10',
      name: 'sriov-prod',
      description: 'SR-IOV',
      network: { id: 'net-02' },
      pass_through: { mode: 'enabled' },
      port_mirroring: false,
      migratable: true,
      failover: { id: 'vnic-02' },
    }
    expect(profileToDraft(profile)).toEqual({
      name: 'sriov-prod',
      description: 'SR-IOV',
      networkId: 'net-02',
      passthrough: true,
      portMirroring: false,
      networkFilterId: '',
      qosId: '',
      migratable: true,
      failoverId: 'vnic-02',
      customProperties: [],
    })
  })

  it('maps a filtered/mirrored non-passthrough profile and forces migratable true', () => {
    const profile: VnicProfile = {
      id: 'vnic-03',
      name: 'vm-prod-mirrored',
      network: { id: 'net-02' },
      pass_through: { mode: 'disabled' },
      port_mirroring: true,
      network_filter: { id: 'nf-vdsm-no-mac-spoofing' },
      qos: { id: 'qos-network-01' },
    }
    const draft = profileToDraft(profile)
    expect(draft.passthrough).toBe(false)
    expect(draft.portMirroring).toBe(true)
    expect(draft.networkFilterId).toBe('nf-vdsm-no-mac-spoofing')
    expect(draft.qosId).toBe('qos-network-01')
    // passthrough off ⇒ migratable is engine-forced true regardless of the wire
    expect(draft.migratable).toBe(true)
  })

  it('fills every optional field with a concrete fallback so the draft is never undefined', () => {
    const draft = profileToDraft({ id: 'vnic-99', name: 'bare' })
    expect(draft).toEqual({
      name: 'bare',
      description: '',
      networkId: '',
      passthrough: false,
      portMirroring: false,
      networkFilterId: '',
      qosId: '',
      migratable: true,
      failoverId: '',
      customProperties: [],
    })
  })

  it('maps custom_properties rows into controlled key/value drafts', () => {
    const profile: VnicProfile = {
      id: 'vnic-05',
      name: 'tuned',
      custom_properties: {
        custom_property: [
          { name: 'queues', value: '4' },
          // absent value collapses to '' so the input stays controlled
          { name: 'security_groups' },
        ],
      },
    }
    expect(profileToDraft(profile).customProperties).toEqual([
      { name: 'queues', value: '4' },
      { name: 'security_groups', value: '' },
    ])
  })
})

describe('blankDraft', () => {
  it('starts empty with passthrough off and migratable forced true', () => {
    expect(blankDraft()).toEqual({
      name: '',
      description: '',
      networkId: '',
      passthrough: false,
      portMirroring: false,
      networkFilterId: '',
      qosId: '',
      migratable: true,
      failoverId: '',
      customProperties: [],
    })
  })
})

// Custom properties ride as the wrapped custom_properties.custom_property list
// (api-model VnicProfile.customProperties). The mapper clears the entity's set
// whenever the key is PRESENT and preserves it when OMITTED — so edit always
// sends the (possibly empty) list and create sends it only when rows exist.
describe('draftToPayload — custom properties', () => {
  it('emits the wrapped list and drops blank-name editor rows', () => {
    const payload = draftToPayload(
      createDraft({
        customProperties: [
          { name: 'queues', value: '4' },
          { name: '  ', value: 'orphan' }, // trailing empty row — dropped
        ],
      }),
      false,
    )
    expect(payload.custom_properties).toEqual({
      custom_property: [{ name: 'queues', value: '4' }],
    })
  })

  it('omits the key on create when no rows are set (nothing to clear)', () => {
    expect(draftToPayload(createDraft(), false)).not.toHaveProperty('custom_properties')
  })

  it('sends an explicit empty list on edit so removing every row clears the set', () => {
    const payload = draftToPayload(createDraft({ customProperties: [] }), true)
    expect(payload.custom_properties).toEqual({ custom_property: [] })
  })
})

// #64: a blank filter/QoS select whose options have not resolved yet must NOT be
// read as "user cleared to None". On edit that would ship an explicit `{}` clear
// and detach a link the profile still legitimately has. The readiness flags let
// the modal suppress that clear until the option list is actually loaded.
describe('draftToPayload — #64 clear-on-blank readiness', () => {
  it('OMITS a blank filter/qos on edit when their options are not ready (no detach)', () => {
    const payload = draftToPayload(createDraft({ networkFilterId: '', qosId: '' }), true, {
      filterOptionsReady: false,
      qosOptionsReady: false,
    })
    // no `{}` clear — the existing links are preserved, not detached
    expect(payload).not.toHaveProperty('network_filter')
    expect(payload).not.toHaveProperty('qos')
  })

  it('still CLEARS a blank filter/qos on edit once their options are ready (real user clear)', () => {
    const payload = draftToPayload(createDraft({ networkFilterId: '', qosId: '' }), true, {
      filterOptionsReady: true,
      qosOptionsReady: true,
    })
    expect(payload.network_filter).toEqual({})
    expect(payload.qos).toEqual({})
  })

  it('sends a chosen link even when its options report not-ready (a value is never suppressed)', () => {
    const payload = draftToPayload(createDraft({ networkFilterId: 'nf-x', qosId: 'qos-x' }), true, {
      filterOptionsReady: false,
      qosOptionsReady: false,
    })
    expect(payload.network_filter).toEqual({ id: 'nf-x' })
    expect(payload.qos).toEqual({ id: 'qos-x' })
  })

  it('gates each link independently — filter clears while qos is held back', () => {
    const payload = draftToPayload(createDraft({ networkFilterId: '', qosId: '' }), true, {
      filterOptionsReady: true,
      qosOptionsReady: false,
    })
    expect(payload.network_filter).toEqual({})
    expect(payload).not.toHaveProperty('qos')
  })

  it('defaults both flags to ready so existing callers keep the clear-on-blank behavior', () => {
    const payload = draftToPayload(createDraft({ networkFilterId: '', qosId: '' }), true)
    expect(payload.network_filter).toEqual({})
    expect(payload.qos).toEqual({})
  })

  it('readiness never affects create mode (a blank link is always omitted there)', () => {
    const payload = draftToPayload(createDraft({ networkFilterId: '', qosId: '' }), false, {
      filterOptionsReady: true,
      qosOptionsReady: true,
    })
    expect(payload).not.toHaveProperty('network_filter')
    expect(payload).not.toHaveProperty('qos')
  })

  it('passthrough clears ride regardless of readiness (driven by the toggle, not the box)', () => {
    const payload = draftToPayload(createDraft({ passthrough: true, migratable: true }), true, {
      filterOptionsReady: false,
      qosOptionsReady: false,
    })
    expect(payload.network_filter).toEqual({})
    expect(payload.qos).toEqual({})
  })
})

describe('resolveNetworkDcId', () => {
  const own: Network = { id: 'net-02', name: 'vm-prod', data_center: { id: 'dc-own' } }
  const cached: Network = { id: 'net-02', name: 'vm-prod', data_center: { id: 'dc-cached' } }

  it('prefers the profile-own network read over the list cache (#64)', () => {
    expect(resolveNetworkDcId(own, cached)).toBe('dc-own')
  })

  it('falls back to the cache when the own read is absent (create mode)', () => {
    expect(resolveNetworkDcId(undefined, cached)).toBe('dc-cached')
  })

  it('is undefined when neither source carries a data center', () => {
    expect(resolveNetworkDcId(undefined, undefined)).toBeUndefined()
    expect(resolveNetworkDcId({ id: 'net-02', name: 'vm-prod' }, undefined)).toBeUndefined()
  })
})
