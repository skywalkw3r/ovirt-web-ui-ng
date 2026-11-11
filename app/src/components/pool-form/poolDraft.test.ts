import { describe, expect, it } from 'vitest'
import type { VmPool } from '../../api/schemas/pool'
import { TemplateSchema } from '../../api/schemas/template'
import {
  BLANK_TEMPLATE_ID,
  blankDraft,
  newPoolPayload,
  poolEditPayload,
  type PoolDraft,
  poolToDraft,
  poolVmBaseDraft,
  poolVmOverrides,
  visibleTemplates,
} from './poolDraft'

const MiB = 1024 * 1024

// A template read with VmBase depth, as the create dialog seeds from it.
const template = TemplateSchema.parse({
  id: 'tpl-02',
  name: 'win2022-base',
  memory: `${8192 * MiB}`,
  memory_policy: { guaranteed: 8192 * MiB, max: `${16384 * MiB}`, ballooning: 'false' },
  cpu: { topology: { sockets: 1, cores: '4', threads: 1 } },
  display: { type: 'spice', monitors: '2' },
  usb: { enabled: 'false' },
  soundcard_enabled: 'true',
  console: { enabled: 'false' },
  virtio_scsi: { enabled: 'true' },
  cpu_shares: '1024',
  custom_properties: { custom_property: [{ name: 'viodiskcache', value: 'writeback' }] },
  large_icon: { id: 'icon-windows' },
})

// A submittable create-mode draft seeded from `template`: the blank pool
// defaults plus the three required fields the modal gates Save on. Returns the
// draft and its baseline (the template seed).
function seeded(overrides: Partial<PoolDraft> = {}): { draft: PoolDraft; baseline: PoolDraft } {
  const baseline: PoolDraft = {
    ...blankDraft(),
    ...poolVmBaseDraft(template, 'icon-windows'),
    name: 'qa-pool',
    clusterId: 'cluster-01',
    templateId: 'tpl-02',
  }
  return { baseline, draft: { ...baseline, ...overrides } }
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

describe('newPoolPayload', () => {
  it('sends the pool fields and no vm block when no VM setting moved', () => {
    const { draft, baseline } = seeded({
      description: 'lab pool',
      comment: 'q3',
      type: 'manual',
      size: '4',
      prestartedVms: '1',
      maxUserVms: '2',
      stateful: true,
    })
    // Exact equality is the point: anything extra or missing here would ride
    // the POST and either 400 or stomp what the template provides.
    expect(newPoolPayload(draft, baseline)).toEqual({
      name: 'qa-pool',
      cluster: { id: 'cluster-01' },
      template: { id: 'tpl-02' },
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
    const { draft, baseline } = seeded({ size: '10', prestartedVms: '3', maxUserVms: '5' })
    const payload = newPoolPayload(draft, baseline)
    expect(payload.size).toBe(10)
    expect(payload.prestarted_vms).toBe(3)
    expect(payload.max_user_vms).toBe(5)
  })

  it('carries the changed VM settings as the vm sub-element', () => {
    const { draft, baseline } = seeded({
      memoryMb: 4096,
      maxMemoryMb: 16384,
      guaranteedMemoryMb: 2048,
      sockets: 2,
      cpuShares: 2048,
      memoryBalloonEnabled: true,
      monitors: 1,
      serialConsoleEnabled: true,
      customProperties: [],
    })
    expect(newPoolPayload(draft, baseline).vm).toEqual({
      memory: 4096 * MiB,
      memory_policy: { guaranteed: 2048 * MiB, ballooning: true },
      cpu: { topology: { sockets: 2, cores: 4, threads: 1 } },
      display: { monitors: 1 },
      cpu_shares: 2048,
      console: { enabled: true },
      // a present-but-empty list clears the template's properties
      custom_properties: { custom_property: [] },
    })
  })

  it('sends the sound card at pool level, where the pool add reads it', () => {
    const { draft, baseline } = seeded({ soundcardEnabled: false })
    const payload = newPoolPayload(draft, baseline)
    expect(payload.soundcard_enabled).toBe(false)
    expect(payload).not.toHaveProperty('vm')
  })
})

describe('poolVmOverrides', () => {
  it('never sends the keys the pool add does not read from vm', () => {
    // USB and VirtIO-SCSI come from the template, an icon upload is dropped,
    // and HA / lease are not offered for pools: none of them may ride.
    const { draft, baseline } = seeded({
      usbEnabled: true,
      virtioScsiEnabled: false,
      iconUploadData: 'aGVsbG8=',
      iconUploadMediaType: 'image/png',
      haEnabled: true,
      leaseStorageDomainId: 'sd-01',
      storageErrorResumeBehaviour: 'kill',
      soundcardEnabled: false,
    })
    expect(poolVmOverrides(draft, baseline)).toEqual({})
  })

  it('is empty for an untouched seed', () => {
    const { draft, baseline } = seeded()
    expect(poolVmOverrides(draft, baseline)).toEqual({})
  })
})

describe('poolEditPayload', () => {
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
    vm: { id: 'vm-09' },
  }

  it('sends only the pool fields that moved', () => {
    const baseline = poolToDraft(pool)
    const draft = { ...baseline, size: '8', comment: 'edited' }
    expect(poolEditPayload(draft, baseline)).toEqual({ size: 8, comment: 'edited' })
  })

  it('is empty when nothing moved', () => {
    const baseline = poolToDraft(pool)
    expect(poolEditPayload({ ...baseline }, baseline)).toEqual({})
  })

  it('never sends the immutable fields or any VM setting', () => {
    // The engine's UpdateVmPoolCommand hard-rejects a change to the pool's
    // identity fields, and BackendVmPoolResource.update ignores `vm`.
    const baseline = poolToDraft(pool)
    const draft: PoolDraft = {
      ...baseline,
      name: 'renamed',
      clusterId: 'cluster-02',
      templateId: 'tpl-02',
      type: 'automatic',
      stateful: false,
      memoryMb: 4096,
      soundcardEnabled: true,
      description: 'grown',
      prestartedVms: '1',
      maxUserVms: '2',
    }
    expect(poolEditPayload(draft, baseline)).toEqual({
      description: 'grown',
      prestarted_vms: 1,
      max_user_vms: 2,
    })
  })
})

describe('poolToDraft', () => {
  it('maps a fully populated pool read model onto the pool fields', () => {
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
    expect(poolToDraft(pool)).toMatchObject({
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
    expect(draft).toMatchObject({
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
    expect(Object.values(draft).every((value) => value !== undefined)).toBe(true)
  })

  it('reads the coerced stateful boolean from the pool read model', () => {
    expect(poolToDraft({ id: 'p', name: 'n', stateful: true }).stateful).toBe(true)
    expect(poolToDraft({ id: 'p', name: 'n', stateful: false }).stateful).toBe(false)
    // absent on the read → defaults off
    expect(poolToDraft({ id: 'p', name: 'n' }).stateful).toBe(false)
  })
})

describe('poolVmBaseDraft', () => {
  it('reads the template slice and defaults an absent max to 4x memory', () => {
    expect(poolVmBaseDraft(template, 'icon-windows')).toMatchObject({
      memoryMb: 8192,
      maxMemoryMb: 16384,
      sockets: 1,
      coresPerSocket: 4,
      graphicsProtocol: 'spice',
      monitors: 2,
      soundcardEnabled: true,
      virtioScsiEnabled: true,
      cpuShares: 1024,
      iconId: 'icon-windows',
    })
    expect(
      poolVmBaseDraft(TemplateSchema.parse({ id: 't', name: 't', memory: 1024 * MiB })),
    ).toMatchObject({ memoryMb: 1024, maxMemoryMb: 4096 })
  })
})

describe('blankDraft', () => {
  it('starts empty with the webadmin PoolModel defaults', () => {
    expect(blankDraft()).toMatchObject({
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
