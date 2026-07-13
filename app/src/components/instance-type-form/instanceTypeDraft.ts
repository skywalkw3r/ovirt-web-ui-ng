import type { InstanceType } from '../../api/schemas/instance-type'
import { vmNameError } from '../edit-vm/editVmDraft'

// Memory is stored in bytes on the wire (see schemas/instance-type.ts) but
// edited in MiB in the modal — convert at the draft boundary so the form works
// in MiB, reusing the same MiB constant / bytesToMb boundary as editVmDraft.
const MiB = 1024 * 1024

// Webadmin seeds the maximum memory at 4x the memory size
// (VmCommonUtils.getMaxMemorySizeDefault → memSize * MAX_MEM_OVER_COMMIT_FACTOR,
// which is 4). We mirror that ratio so a fresh instance type — and any existing
// one whose wire form omits memory_policy.max — carries a max that satisfies the
// engine's `max >= memory` rule instead of defaulting to a rejected 0.
const MAX_MEMORY_RATIO = 4

// The flat, always-defined draft the Instance Type modal owns. Every field is
// always defined (never undefined) so controlled inputs never flip between
// controlled and uncontrolled — optional wire values collapse to '' / 0 / false
// / a sensible default here.
export interface InstanceTypeDraft {
  name: string
  description: string
  // memory (MiB) — bytes on the wire
  memoryMb: number
  guaranteedMemoryMb: number
  maxMemoryMb: number
  // CPU topology
  sockets: number
  coresPerSocket: number
  threadsPerCore: number
  // High Availability
  haEnabled: boolean
  haPriority: number
}

// Round bytes → MiB; an absent value collapses to 0 rather than NaN so the
// number inputs stay controlled. Mirror editVmDraft.bytesToMb.
function bytesToMb(bytes: number | undefined): number {
  return bytes === undefined ? 0 : Math.round(bytes / MiB)
}

// InstanceType read model → fully-populated draft. Every optional wire field is
// given a concrete fallback so the returned draft has no undefined members.
// memory_policy.max is frequently absent on an instance type (unlike a live VM,
// which the engine always seeds); when it is, we seed it from 4x the memory size
// so re-saving an untouched type never PUTs a max of 0 that the engine rejects.
export function instanceTypeToDraft(instanceType: InstanceType): InstanceTypeDraft {
  const memoryMb = bytesToMb(instanceType.memory)
  const wireMaxMb = bytesToMb(instanceType.memory_policy?.max)
  return {
    name: instanceType.name ?? '',
    description: instanceType.description ?? '',
    memoryMb,
    guaranteedMemoryMb: bytesToMb(instanceType.memory_policy?.guaranteed),
    // An absent/zero max on the wire seeds to the webadmin 4x default so the
    // re-emitted payload satisfies max >= memory; a real max is kept as-is.
    maxMemoryMb: wireMaxMb > 0 ? wireMaxMb : memoryMb * MAX_MEMORY_RATIO,
    sockets: instanceType.cpu?.topology?.sockets ?? 1,
    coresPerSocket: instanceType.cpu?.topology?.cores ?? 1,
    threadsPerCore: instanceType.cpu?.topology?.threads ?? 1,
    haEnabled: instanceType.high_availability?.enabled ?? false,
    // Webadmin's NewInstanceTypeModelBehavior initializes Priority to 0.
    haPriority: instanceType.high_availability?.priority ?? 0,
  }
}

// Blank create-mode defaults: 1 GiB memory guaranteed at the same size, the
// webadmin 4x maximum (4 GiB), a single-vCPU topology, HA off at priority 0.
// Matches the webadmin New Instance Type dialog seeds.
export function blankInstanceTypeDraft(): InstanceTypeDraft {
  const memoryMb = 1024
  return {
    name: '',
    description: '',
    memoryMb,
    guaranteedMemoryMb: memoryMb,
    maxMemoryMb: memoryMb * MAX_MEMORY_RATIO,
    sockets: 1,
    coresPerSocket: 1,
    threadsPerCore: 1,
    haEnabled: false,
    haPriority: 0,
  }
}

// Draft → POST/PUT body. Memory fields go back to bytes; the shape mirrors the
// InstanceType read model the schema coerces on the way back. The same body is
// used for create and edit — an instance type has no create-only/immutable key
// to strip (unlike a cluster's data center).
//
// memory_policy.max is omitted entirely when it is 0/unset: the engine rejects
// `max < memory` (VmHandler.validateMaxMemorySize), so sending max: 0 with a
// non-zero memory 400s every create/edit. Omitting it lets the engine apply its
// own default instead. guaranteed rides the same guard for symmetry.
export function draftToPayload(draft: InstanceTypeDraft): Record<string, unknown> {
  const memoryPolicy: Record<string, unknown> = {}
  if (draft.guaranteedMemoryMb > 0) memoryPolicy.guaranteed = draft.guaranteedMemoryMb * MiB
  if (draft.maxMemoryMb > 0) memoryPolicy.max = draft.maxMemoryMb * MiB

  const payload: Record<string, unknown> = {
    name: draft.name,
    description: draft.description,
    memory: draft.memoryMb * MiB,
    cpu: {
      topology: {
        sockets: draft.sockets,
        cores: draft.coresPerSocket,
        threads: draft.threadsPerCore,
      },
    },
    high_availability: { enabled: draft.haEnabled, priority: draft.haPriority },
  }

  // Only attach memory_policy when it carries at least one field, so an
  // all-unset policy never ships an empty object.
  if (Object.keys(memoryPolicy).length > 0) payload.memory_policy = memoryPolicy

  return payload
}

// Instance-type name validation. Webadmin's InstanceType extends UnitVmModel and
// runs NotEmpty + Length(64) + I18NNameValidation, the same rules the Edit VM /
// Clone VM dialogs use — so reuse vmNameError for identical inline feedback
// (unicode letters, digits, '-', '_' and '.', no spaces) instead of bouncing a
// raw engine fault.
export const instanceTypeNameError = vmNameError

// Memory relationship validation (webadmin parity). The engine requires
// guaranteed <= memory <= max; surface it inline so the user sees why Save is
// blocked rather than eating a raw fault. Returns undefined when the sizing is
// consistent. max is only checked when set (0 means "let the engine default").
export function instanceTypeMemoryError(draft: InstanceTypeDraft): string | undefined {
  if (draft.memoryMb <= 0) return 'Memory size must be greater than 0'
  if (draft.guaranteedMemoryMb > draft.memoryMb) {
    return 'Physical memory guaranteed cannot exceed the memory size'
  }
  if (draft.maxMemoryMb > 0 && draft.maxMemoryMb < draft.memoryMb) {
    return 'Maximum memory cannot be smaller than the memory size'
  }
  return undefined
}

// When the memory size changes, webadmin keeps the guaranteed and maximum
// tracking it (UnitVmModel.memSize_EntityChanged seeds MinAllocatedMemory ==
// MemSize; getMaxMemorySizeDefault re-derives max = memSize * 4). Mirror that:
// given the previous and next memory size, return the fields that were pinned to
// the old memory (guaranteed == old memory, max == old memory * 4) re-pinned to
// the new one, so a user who raises Memory Size does not silently ship a stale
// guaranteed/max. A field the user has moved off the tracked value is left alone.
export function retrackMemory(
  draft: InstanceTypeDraft,
  previousMemoryMb: number,
  nextMemoryMb: number,
): InstanceTypeDraft {
  const next = { ...draft, memoryMb: nextMemoryMb }
  if (draft.guaranteedMemoryMb === previousMemoryMb) next.guaranteedMemoryMb = nextMemoryMb
  if (draft.maxMemoryMb === previousMemoryMb * MAX_MEMORY_RATIO) {
    next.maxMemoryMb = nextMemoryMb * MAX_MEMORY_RATIO
  }
  return next
}
