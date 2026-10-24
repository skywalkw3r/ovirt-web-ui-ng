import { describe, expect, it } from 'vitest'
import type { VmPool } from '../../api/schemas/pool'
import {
  BLANK_TEMPLATE_ID,
  blankDraft,
  draftToPayload,
  type PoolDraft,
  poolToDraft,
  visibleTemplates,
} from './poolDraft'

// A submittable create-mode draft: the blank defaults plus the three required
// fields the modal gates Save on. Tests override single fields from here so
// each case reads as "blank draft except …".
function createDraft(overrides: Partial<PoolDraft> = {}): PoolDraft {
  return {
    ...blankDraft(),
    name: 'qa-pool',
    clusterId: 'cluster-01',
    templateId: 'tpl-01',
    ...overrides,
  }
}

describe('visibleTemplates', () => {
  it('drops the Blank system template by its all-zero id (live engine form)', () => {
    const templates = [
      { id: BLANK_TEMPLATE_ID, name: 'Blank' },
      { id: 'tpl-01', name: 'centos-stream-9' },
    ]
    expect(visibleTemplates(templates).map((t) => t.id)).toEqual(['tpl-01'])
  })

  it('drops the Blank template by name too (mock fixtures give it a non-zero id)', () => {
    // The mock's Blank is tpl-00 named 'Blank', not the all-zero id — the name
    // guard catches that form so the picker filters it in dev:mock as well.
    const templates = [
      { id: 'tpl-00', name: 'Blank' },
      { id: 'tpl-02', name: 'win2022-base' },
    ]
    expect(visibleTemplates(templates).map((t) => t.id)).toEqual(['tpl-02'])
  })

  it('keeps every real template, order preserved', () => {
    const templates = [
      { id: 'tpl-01', name: 'centos-stream-9' },
      { id: 'tpl-02', name: 'win2022-base' },
    ]
    expect(visibleTemplates(templates)).toEqual(templates)
  })

  it('returns an empty list when only Blank is available', () => {
    expect(visibleTemplates([{ id: BLANK_TEMPLATE_ID, name: 'Blank' }])).toEqual([])
  })
})

describe('draftToPayload — create mode', () => {
  it('sends name, cluster, template and type alongside the mutable fields', () => {
    const payload = draftToPayload(
      createDraft({
        description: 'lab pool',
        comment: 'q3',
        type: 'manual',
        size: '4',
        prestartedVms: '1',
        maxUserVms: '2',
        stateful: true,
      }),
      false,
    )
    // Exact equality is the point: anything extra or missing here would ride
    // the POST and either 400 or stomp an engine-side default.
    expect(payload).toEqual({
      name: 'qa-pool',
      cluster: { id: 'cluster-01' },
      template: { id: 'tpl-01' },
      type: 'manual',
      stateful: true,
      description: 'lab pool',
      comment: 'q3',
      size: 4,
      prestarted_vms: 1,
      max_user_vms: 2,
    })
  })

  it('coerces the string-valued numeric fields to numbers', () => {
    const payload = draftToPayload(
      createDraft({ size: '10', prestartedVms: '3', maxUserVms: '5' }),
      false,
    )
    expect(payload.size).toBe(10)
    expect(payload.prestarted_vms).toBe(3)
    expect(payload.max_user_vms).toBe(5)
  })
})

describe('draftToPayload — edit mode', () => {
  it('omits the immutable name/cluster/template/type/stateful entirely', () => {
    // The engine's UpdateVmPoolCommand hard-rejects a change to any of these,
    // so the edit body must not echo them back at all — not even unchanged.
    const payload = draftToPayload(
      createDraft({
        description: 'grown',
        comment: 'edited',
        size: '8',
        prestartedVms: '2',
        maxUserVms: '3',
        stateful: true,
      }),
      true,
    )
    expect(payload).toEqual({
      description: 'grown',
      comment: 'edited',
      size: 8,
      prestarted_vms: 2,
      max_user_vms: 3,
    })
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('cluster')
    expect(payload).not.toHaveProperty('template')
    expect(payload).not.toHaveProperty('type')
    expect(payload).not.toHaveProperty('stateful')
  })
})

describe('poolToDraft', () => {
  it('maps a fully populated pool read model onto the draft', () => {
    const pool: VmPool = {
      id: 'pool-01',
      name: 'dev-pool',
      description: 'developer sandboxes',
      comment: 'shared',
      type: 'manual',
      size: 5,
      prestarted_vms: 2,
      max_user_vms: 3,
      stateful: true,
      cluster: { id: 'cluster-01', name: 'Default' },
      vm: { id: 'tpl-01' },
    }
    expect(poolToDraft(pool)).toEqual({
      name: 'dev-pool',
      clusterId: 'cluster-01',
      templateId: 'tpl-01',
      description: 'developer sandboxes',
      comment: 'shared',
      type: 'manual',
      size: '5',
      prestartedVms: '2',
      maxUserVms: '3',
      stateful: true,
    })
  })

  it('fills every optional field with a concrete fallback so the draft is never undefined', () => {
    // A sparse pool (only id/name) must still yield a fully controlled draft —
    // undefined members would flip the inputs controlled/uncontrolled.
    const draft = poolToDraft({ id: 'pool-99', name: 'bare' })
    expect(draft).toEqual({
      name: 'bare',
      clusterId: '',
      templateId: '',
      description: '',
      comment: '',
      type: 'automatic',
      size: '1',
      prestartedVms: '0',
      maxUserVms: '1',
      stateful: false,
    })
  })

  it('reads the coerced stateful boolean from the pool read model', () => {
    expect(poolToDraft({ id: 'p', name: 'n', stateful: true }).stateful).toBe(true)
    expect(poolToDraft({ id: 'p', name: 'n', stateful: false }).stateful).toBe(false)
    // absent on the read → defaults off
    expect(poolToDraft({ id: 'p', name: 'n' }).stateful).toBe(false)
  })
})

describe('blankDraft', () => {
  it('starts empty with the webadmin PoolModel defaults', () => {
    expect(blankDraft()).toEqual({
      name: '',
      clusterId: '',
      templateId: '',
      description: '',
      comment: '',
      type: 'automatic',
      size: '1',
      prestartedVms: '0',
      maxUserVms: '1',
      stateful: false,
    })
  })
})
