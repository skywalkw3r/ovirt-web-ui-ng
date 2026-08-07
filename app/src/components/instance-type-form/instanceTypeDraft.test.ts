import { describe, expect, it } from 'vitest'
import type { InstanceType } from '../../api/schemas/instance-type'
import {
  blankInstanceTypeDraft,
  draftToPayload,
  instanceTypeMemoryError,
  instanceTypeNameError,
  instanceTypeToDraft,
  retrackMemory,
  type InstanceTypeDraft,
} from './instanceTypeDraft'

const MiB = 1024 * 1024

// A submittable create-mode draft: the blank defaults plus a name. Tests
// override single fields from here so each case reads as "blank draft except …".
function createDraft(overrides: Partial<InstanceTypeDraft> = {}): InstanceTypeDraft {
  return {
    ...blankInstanceTypeDraft(),
    name: 'XLarge',
    ...overrides,
  }
}

describe('blankInstanceTypeDraft', () => {
  it('seeds max at 4x memory and guaranteed at the memory size (webadmin defaults)', () => {
    // Regression: the old blank seeded maxMemoryMb: 0, so an untouched New
    // Instance Type POSTed memory_policy.max = 0 with a 1 GiB memory and the
    // engine 400'd every create. Webadmin seeds max = memSize * 4.
    expect(blankInstanceTypeDraft()).toEqual({
      name: '',
      description: '',
      memoryMb: 1024,
      guaranteedMemoryMb: 1024,
      maxMemoryMb: 4096,
      sockets: 1,
      coresPerSocket: 1,
      threadsPerCore: 1,
      haEnabled: false,
      haPriority: 0,
    })
  })

  it('produces a payload the engine accepts (max >= memory) with no other input', () => {
    // The whole point of the 4x default: draftToPayload of the untouched blank
    // must carry a max >= memory so the default create is not rejected.
    const payload = draftToPayload(blankInstanceTypeDraft())
    const memoryPolicy = payload.memory_policy as { max: number; guaranteed: number }
    expect(payload.memory).toBe(1024 * MiB)
    expect(memoryPolicy.max).toBe(4096 * MiB)
    expect(memoryPolicy.max).toBeGreaterThanOrEqual(payload.memory as number)
  })
})

describe('instanceTypeToDraft', () => {
  it('seeds a missing memory_policy.max from 4x memory so an untouched edit re-saves cleanly', () => {
    // Regression: instance types frequently omit memory_policy.max (the mock
    // Small/Large fixtures do). The old mapping made maxMemoryMb 0, so opening
    // Edit and pressing Save re-sent max: 0 < memory and the engine 400'd. The
    // draft now backfills max = memory * 4.
    const small: InstanceType = {
      id: 'instance-type-small',
      name: 'Small',
      memory: 1073741824, // 1 GiB
      memory_policy: { guaranteed: 1073741824 },
    }
    const draft = instanceTypeToDraft(small)
    expect(draft.memoryMb).toBe(1024)
    expect(draft.maxMemoryMb).toBe(4096)
    // and the round-tripped payload carries a max >= memory
    const payload = draftToPayload(draft)
    const memoryPolicy = payload.memory_policy as { max: number }
    expect(memoryPolicy.max).toBeGreaterThanOrEqual(payload.memory as number)
  })

  it('keeps an explicit memory_policy.max as-is (does not overwrite with the 4x default)', () => {
    const medium: InstanceType = {
      id: 'instance-type-medium',
      name: 'Medium',
      memory: 2147483648, // 2 GiB
      memory_policy: { guaranteed: 1073741824, max: 4294967296 }, // max 4 GiB (2x, not 4x)
    }
    const draft = instanceTypeToDraft(medium)
    expect(draft.memoryMb).toBe(2048)
    expect(draft.maxMemoryMb).toBe(4096) // 4 GiB kept verbatim, not re-derived to 8 GiB
  })

  it('defaults HA priority to 0 (webadmin NewInstanceTypeModelBehavior), not 1', () => {
    const draft = instanceTypeToDraft({ id: 'x', name: 'x', high_availability: { enabled: true } })
    expect(draft.haPriority).toBe(0)
  })

  it('fills every optional field with a concrete fallback so the draft is never undefined', () => {
    const draft = instanceTypeToDraft({ id: 'bare-id', name: 'bare' })
    expect(draft).toEqual({
      name: 'bare',
      description: '',
      memoryMb: 0,
      guaranteedMemoryMb: 0,
      maxMemoryMb: 0, // 4 * 0 — no memory, so nothing to seed a max from
      sockets: 1,
      coresPerSocket: 1,
      threadsPerCore: 1,
      haEnabled: false,
      haPriority: 0,
    })
  })
})

describe('draftToPayload', () => {
  it('sends the full body for a well-formed draft', () => {
    const payload = draftToPayload(
      createDraft({
        description: '8 vCPU, 8 GiB',
        memoryMb: 8192,
        guaranteedMemoryMb: 8192,
        maxMemoryMb: 32768,
        sockets: 4,
        coresPerSocket: 2,
        threadsPerCore: 1,
        haEnabled: true,
        haPriority: 3,
      }),
    )
    expect(payload).toEqual({
      name: 'XLarge',
      description: '8 vCPU, 8 GiB',
      memory: 8192 * MiB,
      memory_policy: { guaranteed: 8192 * MiB, max: 32768 * MiB },
      cpu: { topology: { sockets: 4, cores: 2, threads: 1 } },
      high_availability: { enabled: true, priority: 3 },
    })
  })

  it('omits memory_policy.max when maxMemoryMb is 0 so the engine defaults it (no rejected max:0)', () => {
    // The finding: draftToPayload always emitted memory_policy.max = maxMemoryMb
    // * MiB, so a 0 max shipped max: 0 and the engine rejected it. A 0/unset max
    // must be omitted, letting the engine apply its own default.
    const payload = draftToPayload(createDraft({ memoryMb: 1024, maxMemoryMb: 0 }))
    const memoryPolicy = payload.memory_policy as Record<string, unknown>
    expect(memoryPolicy).not.toHaveProperty('max')
    expect(memoryPolicy.guaranteed).toBe(1024 * MiB)
  })

  it('omits memory_policy.guaranteed when it is 0', () => {
    const payload = draftToPayload(createDraft({ guaranteedMemoryMb: 0, maxMemoryMb: 4096 }))
    const memoryPolicy = payload.memory_policy as Record<string, unknown>
    expect(memoryPolicy).not.toHaveProperty('guaranteed')
    expect(memoryPolicy.max).toBe(4096 * MiB)
  })

  it('drops memory_policy entirely when both guaranteed and max are 0', () => {
    const payload = draftToPayload(createDraft({ guaranteedMemoryMb: 0, maxMemoryMb: 0 }))
    expect(payload).not.toHaveProperty('memory_policy')
    // memory itself still rides
    expect(payload.memory).toBe(1024 * MiB)
  })
})

describe('instanceTypeNameError', () => {
  it('rejects an empty name', () => {
    expect(instanceTypeNameError('   ')).toBeDefined()
  })

  it('rejects a name with a space (webadmin I18NNameValidation)', () => {
    // The finding: the modal only gated on name.trim() !== '', so 'My Type'
    // passed client validation and bounced off the engine. The shared VM-name
    // validator forbids spaces.
    expect(instanceTypeNameError('My Type')).toBeDefined()
  })

  it('rejects a name over 64 characters', () => {
    expect(instanceTypeNameError('a'.repeat(65))).toBeDefined()
  })

  it('accepts a valid dotted/underscored name', () => {
    expect(instanceTypeNameError('web-tier_v2.1')).toBeUndefined()
  })
})

describe('instanceTypeMemoryError', () => {
  it('flags a max smaller than the memory size', () => {
    expect(
      instanceTypeMemoryError(createDraft({ memoryMb: 4096, maxMemoryMb: 2048 })),
    ).toBeDefined()
  })

  it('flags guaranteed larger than the memory size', () => {
    expect(
      instanceTypeMemoryError(createDraft({ memoryMb: 1024, guaranteedMemoryMb: 2048 })),
    ).toBeDefined()
  })

  it('flags a non-positive memory size', () => {
    expect(instanceTypeMemoryError(createDraft({ memoryMb: 0 }))).toBeDefined()
  })

  it('accepts guaranteed <= memory <= max', () => {
    expect(
      instanceTypeMemoryError(
        createDraft({ memoryMb: 2048, guaranteedMemoryMb: 1024, maxMemoryMb: 8192 }),
      ),
    ).toBeUndefined()
  })

  it('ignores an unset (0) max — the engine defaults it', () => {
    expect(
      instanceTypeMemoryError(
        createDraft({ memoryMb: 2048, guaranteedMemoryMb: 2048, maxMemoryMb: 0 }),
      ),
    ).toBeUndefined()
  })
})

describe('retrackMemory', () => {
  it('moves guaranteed and max with the memory size when they still track it', () => {
    // Webadmin memSize_EntityChanged: raising Memory Size re-pins a guaranteed
    // that equalled the old memory and a max that equalled old memory * 4.
    const draft = createDraft({ memoryMb: 1024, guaranteedMemoryMb: 1024, maxMemoryMb: 4096 })
    const next = retrackMemory(draft, 1024, 2048)
    expect(next.memoryMb).toBe(2048)
    expect(next.guaranteedMemoryMb).toBe(2048)
    expect(next.maxMemoryMb).toBe(8192)
  })

  it('leaves a guaranteed/max the user has moved off the tracked value alone', () => {
    // guaranteed 512 (not == old memory) and max 10000 (not == old memory*4)
    // were deliberately set, so raising memory must not clobber them.
    const draft = createDraft({ memoryMb: 1024, guaranteedMemoryMb: 512, maxMemoryMb: 10000 })
    const next = retrackMemory(draft, 1024, 2048)
    expect(next.memoryMb).toBe(2048)
    expect(next.guaranteedMemoryMb).toBe(512)
    expect(next.maxMemoryMb).toBe(10000)
  })
})
