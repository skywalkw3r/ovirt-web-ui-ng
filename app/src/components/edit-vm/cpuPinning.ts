import type { MessageId } from '../../i18n/messages/en'

// CPU pinning for the Edit VM dialog: the 4.5 pinning policy plus the manual
// pinning string in webadmin's own format. Pure functions only (parse,
// validate, wire shape), unit-tested in cpuPinning.test.ts.
//
// Wire shape, verified against ovirt-engine-api-model and the engine's REST
// mappers:
//   vm.cpu_pinning_policy            types/CpuPinningPolicy (since 4.5)
//   vm.cpu.cpu_tune.vcpu_pins.vcpu_pin[] { vcpu, cpu_set }   types/CpuTune
// The engine stores the pinning as ONE string, "<vcpu>#<cpu set>" entries
// joined by "_" (VmBaseMapper.cpuTuneToString / stringToCpuTune), which is
// exactly what webadmin's "CPU Pinning topology" field edits. So the text
// field round-trips 1:1 with the vcpu_pin list.

// api-model CpuPinningPolicy, in webadmin's CpuPinningListModel order.
// isolate_threads exists since 4.5.1.
export const CPU_PINNING_POLICY_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'none', labelId: 'vm.edit.pinning.policy.none' },
  { value: 'manual', labelId: 'vm.edit.pinning.policy.manual' },
  { value: 'resize_and_pin_numa', labelId: 'vm.edit.pinning.policy.resizeAndPin' },
  { value: 'dedicated', labelId: 'vm.edit.pinning.policy.dedicated' },
  { value: 'isolate_threads', labelId: 'vm.edit.pinning.policy.isolateThreads' },
]

// The engine's CpuPinningPolicy.isExclusive(): the two policies that dedicate
// physical CPUs to the VM.
export function isExclusivePinningPolicy(policy: string): boolean {
  return policy === 'dedicated' || policy === 'isolate_threads'
}

// A validation failure the section renders through t(id, values).
export interface DraftError {
  id: MessageId
  values?: Record<string, string | number>
}

// One "<vcpu>#<cpu set>" entry of the pinning string.
export interface VcpuPin {
  vcpu: number
  cpuSet: string
}

// The engine's own syntax check (bll CpuPinningValidator.cpuPinningPattern):
// entries joined by "_", each "<vcpu>#<set>", a set being comma-separated host
// CPUs, "a-b" ranges and "^n" exclusions.
const CPU_PINNING_PATTERN =
  /^\d+#(\^\d+|\d+-\d+|\d+)(,(\^\d+|\d+-\d+|\d+))*(_\d+#(\^\d+|\d+-\d+|\d+)(,(\^\d+|\d+-\d+|\d+))*)*$/

// Split a syntactically valid pinning string into its entries. Anything the
// pattern rejects parses to [] (callers validate first).
export function parseCpuPinning(text: string): VcpuPin[] {
  const trimmed = text.trim()
  if (!CPU_PINNING_PATTERN.test(trimmed)) return []
  return trimmed.split('_').map((rule) => {
    const [vcpu, cpuSet] = rule.split('#')
    return { vcpu: Number(vcpu), cpuSet }
  })
}

// vcpu_pin[] back to the pinning string (the engine's cpuTuneToString).
export function formatCpuPinning(pins: VcpuPin[]): string {
  return pins.map((pin) => `${pin.vcpu}#${pin.cpuSet}`).join('_')
}

// The host CPUs a cpu set resolves to, mirroring the engine's
// CpuPinningHelper.parsePCpuPinningNumbers: includes minus exclusions, and a
// range whose start is not below its end voids the whole set.
export function hostCpusOfSet(cpuSet: string): number[] {
  const include = new Set<number>()
  const exclude = new Set<number>()
  for (const section of cpuSet.split(',')) {
    if (section.startsWith('^')) {
      exclude.add(Number(section.slice(1)))
    } else if (section.includes('-')) {
      const [start, end] = section.split('-').map(Number)
      if (!(start < end)) return []
      for (let cpu = start; cpu <= end; cpu += 1) include.add(cpu)
    } else {
      include.add(Number(section))
    }
  }
  return [...include].filter((cpu) => !exclude.has(cpu)).sort((a, b) => a - b)
}

// Validate the manual pinning string the way the engine does on save
// (CpuPinningValidator.isCpuPinningValid, same order), so the user sees why a
// save would bounce instead of a raw fault:
//   - Manual needs a string at all (webadmin NotEmptyValidation; engine
//     ACTION_TYPE_CANNOT_SET_MANUAL_PINNING)
//   - the syntax pattern
//   - the VM is pinned to at least one host (webadmin only enables Manual with
//     a specific host; engine ..._CANNOT_BE_PINNED_TO_CPU_WITH_UNDEFINED_HOST)
//   - every vCPU exists, is pinned once, and to at least one host CPU
// Whether the host CPUs exist on the host is a run-time (scheduling) check on
// the engine and is not mirrored. Returns undefined when valid.
export function cpuPinningError(
  text: string,
  context: { vcpuCount: number; hasSpecificHost: boolean },
): DraftError | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return { id: 'vm.edit.pinning.error.required' }
  if (!CPU_PINNING_PATTERN.test(trimmed)) return { id: 'vm.edit.pinning.error.syntax' }
  if (!context.hasSpecificHost) return { id: 'vm.edit.pinning.error.needsHost' }
  const seen = new Set<number>()
  for (const pin of parseCpuPinning(trimmed)) {
    if (pin.vcpu >= context.vcpuCount) {
      return {
        id: 'vm.edit.pinning.error.vcpuMissing',
        values: { vcpu: pin.vcpu, max: context.vcpuCount - 1 },
      }
    }
    if (seen.has(pin.vcpu)) {
      return { id: 'vm.edit.pinning.error.duplicate', values: { vcpu: pin.vcpu } }
    }
    seen.add(pin.vcpu)
    if (hostCpusOfSet(pin.cpuSet).length === 0) {
      return { id: 'vm.edit.pinning.error.noCpu', values: { vcpu: pin.vcpu } }
    }
  }
  return undefined
}

// The cpu.cpu_tune body for a pinning string. '' sends a present-but-empty
// vcpu_pin list, which the mapper turns into the empty pinning string (clears
// the pinning; the same present-but-empty convention placement_policy.hosts
// uses).
export function cpuTuneBody(text: string): Record<string, unknown> {
  return {
    vcpu_pins: {
      vcpu_pin: parseCpuPinning(text).map((pin) => ({ vcpu: pin.vcpu, cpu_set: pin.cpuSet })),
    },
  }
}

// The draft fields the pinning rules read (structural, so this module stays
// free of an import cycle with editVmDraft).
interface PinningDraftFields {
  sockets: number
  coresPerSocket: number
  threadsPerCore: number
  startRunningOn: string
  placementHostIds: string[]
  cpuPinningPolicy: string
  cpuPinning: string
}

// Total vCPUs of the draft topology (the engine's VmBase.getNumOfCpus).
export function draftVcpuCount(
  draft: Pick<PinningDraftFields, 'sockets' | 'coresPerSocket' | 'threadsPerCore'>,
): number {
  return draft.sockets * draft.coresPerSocket * draft.threadsPerCore
}

// "Specific Host(s)" with at least one host picked: the engine's non-empty
// dedicatedVmForVdsList, which manual CPU pinning and vNUMA pinning both need.
export function draftHasSpecificHost(
  draft: Pick<PinningDraftFields, 'startRunningOn' | 'placementHostIds'>,
): boolean {
  return draft.startRunningOn === 'specific' && draft.placementHostIds.length > 0
}

// The pinning string that is actually in force: webadmin clears the field for
// every policy but Manual (VmModelBehaviorBase.updateCpuPinningVisibility), and
// the engine rejects a string under any other policy
// (ACTION_TYPE_FAILED_VM_MANUAL_PINNING_POLICY_NOT_SELECTED).
export function effectiveCpuPinning(
  draft: Pick<PinningDraftFields, 'cpuPinningPolicy' | 'cpuPinning'>,
): string {
  return draft.cpuPinningPolicy === 'manual' ? draft.cpuPinning.trim() : ''
}

// The CPU pinning error of a whole draft, or undefined. Only Manual carries a
// string to validate.
export function cpuPinningDraftError(draft: PinningDraftFields): DraftError | undefined {
  if (draft.cpuPinningPolicy !== 'manual') return undefined
  return cpuPinningError(draft.cpuPinning, {
    vcpuCount: draftVcpuCount(draft),
    hasSpecificHost: draftHasSpecificHost(draft),
  })
}
