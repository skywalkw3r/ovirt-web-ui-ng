import type { InstanceType } from '../../api/schemas/instance-type'
import { vmNameError } from '../edit-vm/editVmDraft'
import {
  allContentDeviceFields,
  MAX_MEMORY_RATIO,
  vmBaseChangedPayload,
  vmBaseToDraft,
  type ConsoleFields,
  type DeviceLoadFields,
  type HighAvailabilityFields,
  type ResourceAllocationFields,
  type SystemFields,
  type VmBaseDraft,
} from '../edit-vm/vmBaseDraft'

const MiB = 1024 * 1024

// The draft the Instance Type dialog owns. It reuses the shared Edit VM
// sections through the VmBase slice (edit-vm/vmBaseDraft.ts) and adds only
// the General fields. Every field is always defined. Serial console, sound card
// and VirtIO-SCSI are all_content device flags: an edit seeds them "not loaded"
// and the dialog folds getInstanceTypeAllContentDevices into draft and
// baseline; a create's defaults are the dialog's own (devicesLoaded true).
export interface InstanceTypeDraft extends VmBaseDraft, DeviceLoadFields {
  name: string
  description: string
}

// ── What REST accepts for an instance type ──────────────────────────────────
//
// InstanceType extends Template in the api-model, but ovirt-engine 4.5 maps
// only a subset of VmBase for it:
//   • InstanceTypeMapper → VmBaseMapper.mapCommonModelToEntity: name,
//     description, memory, memory_policy (guaranteed, max, ballooning),
//     cpu.topology, high_availability, display.monitors,
//     display.smartcard_enabled, io.threads, custom_cpu_model,
//     custom_emulated_machine (plus lease, placement, migration and boot
//     devices, which this dialog does not edit).
//   • BackendInstanceType(s)Resource: display.type (graphics devices),
//     console.enabled, virtio_scsi.enabled, soundcard_enabled, and usb on
//     UPDATE only (the add path never reads usb).
// Everything mapVmBaseModelToEntity alone handles (time zone, serial number,
// SSO, VNC keyboard, SPICE channels, disconnect action, resume behaviour, CPU
// profile and shares, queue settings, custom properties, icon) is dropped
// silently, so the dialog does not offer it. Webadmin's InstanceTypesPopupWidget
// hides the same fields, plus the lease row (kept hidden here too).
const REST_KEYS = new Set([
  'name',
  'description',
  'memory',
  'memory_policy',
  'cpu',
  'high_availability',
  'display',
  'usb',
  'soundcard_enabled',
  'console',
  'io',
  'virtio_scsi',
  'custom_cpu_model',
  'custom_emulated_machine',
])
const REST_DISPLAY_KEYS = new Set(['type', 'monitors', 'smartcard_enabled'])

// The shared-section fields the dialog leaves out (see above). Passed to each
// section's hiddenFields.
export const INSTANCE_TYPE_HIDDEN_FIELDS: {
  system: readonly (keyof SystemFields)[]
  console: readonly (keyof ConsoleFields)[]
  highAvailability: readonly (keyof HighAvailabilityFields)[]
  resourceAllocation: readonly (keyof ResourceAllocationFields)[]
} = {
  system: ['hardwareClockTimezone', 'serialNumberPolicy', 'customSerialNumber'],
  console: [
    'vncKeyboardLayout',
    'ssoEnabled',
    'spiceFileTransfer',
    'spiceCopyPaste',
    'disconnectAction',
  ],
  highAvailability: ['leaseStorageDomainId', 'storageErrorResumeBehaviour'],
  resourceAllocation: [
    'cpuProfileId',
    'cpuShares',
    'virtioScsiMultiQueuesEnabled',
    'virtioScsiMultiQueues',
    'multiQueuesEnabled',
  ],
}

// Keep only what REST maps for an instance type. The hidden fields never move,
// so this is a guard rather than the main filter.
function restSubset(payload: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!REST_KEYS.has(key)) continue
    if (key === 'display') {
      const display = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([k]) => REST_DISPLAY_KEYS.has(k)),
      )
      if (Object.keys(display).length > 0) body.display = display
      continue
    }
    body[key] = value
  }
  return body
}

// A read whose max is absent or 0 shows webadmin's 4x default, so the System
// section never presents "max 0". Max is only sent when the user changes it.
function withMaxDefault(base: VmBaseDraft): VmBaseDraft {
  return base.maxMemoryMb > 0 ? base : { ...base, maxMemoryMb: base.memoryMb * MAX_MEMORY_RATIO }
}

// InstanceType read model → draft (edit mode). Seeded once; the seed is the
// baseline the save diffs against. The device flags are not on the list read
// the dialog opens with, so they start as placeholders until the all_content
// read lands.
export function instanceTypeToDraft(instanceType: InstanceType): InstanceTypeDraft {
  return {
    ...withMaxDefault(vmBaseToDraft(instanceType)),
    ...allContentDeviceFields(undefined),
    name: instanceType.name ?? '',
    description: instanceType.description ?? '',
  }
}

// Create-mode defaults, as webadmin's NewInstanceTypeModelBehavior seeds them:
// 1 GiB guaranteed at the same size with the 4x maximum, one vCPU, SPICE with
// one monitor, USB, VirtIO-SCSI and HA off (HA priority Low), ballooning on.
export function blankInstanceTypeDraft(): InstanceTypeDraft {
  return {
    ...vmBaseToDraft({
      memory: 1024 * MiB,
      memory_policy: {
        guaranteed: 1024 * MiB,
        max: 1024 * MiB * MAX_MEMORY_RATIO,
        ballooning: true,
      },
      display: { type: 'spice', monitors: 1 },
      high_availability: { enabled: false, priority: 1 },
    }),
    devicesLoaded: true,
    name: '',
    description: '',
  }
}

// PUT /instancetypes/{id} body: only the fields that moved from the loaded
// instance type ({} when nothing did), so the engine keeps everything else.
// The device flags ride only once the all_content read seeded both sides.
export function instanceTypeEditPayload(
  draft: InstanceTypeDraft,
  baseline: InstanceTypeDraft,
): Record<string, unknown> {
  const payload = vmBaseChangedPayload(draft, baseline, {
    devicesRead: draft.devicesLoaded && baseline.devicesLoaded,
  })
  if (draft.name !== baseline.name) payload.name = draft.name
  if (draft.description !== baseline.description) payload.description = draft.description
  return restSubset(payload)
}

// POST /instancetypes body: every field the dialog shows, so the new instance
// type matches the dialog rather than engine defaults. Memory limits ride only
// when positive (0 = let the engine default them; a sent 0 is rejected), and
// empty overrides are left out. USB is not here: the engine's add path never
// reads it, so instanceTypeCreateFollowUp sets it with a PUT afterwards.
export function newInstanceTypePayload(draft: InstanceTypeDraft): Record<string, unknown> {
  const memoryPolicy: Record<string, unknown> = { ballooning: draft.memoryBalloonEnabled }
  if (draft.guaranteedMemoryMb > 0) memoryPolicy.guaranteed = draft.guaranteedMemoryMb * MiB
  if (draft.maxMemoryMb > 0) memoryPolicy.max = draft.maxMemoryMb * MiB

  const display: Record<string, unknown> = {
    monitors: draft.monitors,
    smartcard_enabled: draft.smartcardEnabled,
  }
  if (draft.graphicsProtocol !== 'headless') display.type = draft.graphicsProtocol

  const payload: Record<string, unknown> = {
    name: draft.name,
    memory: draft.memoryMb * MiB,
    memory_policy: memoryPolicy,
    cpu: {
      topology: {
        sockets: draft.sockets,
        cores: draft.coresPerSocket,
        threads: draft.threadsPerCore,
      },
    },
    high_availability: { enabled: draft.haEnabled, priority: draft.haPriority },
    display,
    soundcard_enabled: draft.soundcardEnabled,
    console: { enabled: draft.serialConsoleEnabled },
    virtio_scsi: { enabled: draft.virtioScsiEnabled },
    io: { threads: draft.ioThreads },
  }
  if (draft.description !== '') payload.description = draft.description
  if (draft.customEmulatedMachine !== '') {
    payload.custom_emulated_machine = draft.customEmulatedMachine
  }
  if (draft.customCpuModel !== '') payload.custom_cpu_model = draft.customCpuModel
  return payload
}

// The PUT that follows a create when the dialog set something the add path
// ignores (only USB), or undefined when there is nothing to follow up.
export function instanceTypeCreateFollowUp(
  draft: InstanceTypeDraft,
): Record<string, unknown> | undefined {
  return draft.usbEnabled ? { usb: { enabled: true } } : undefined
}

// Instance-type name validation. Webadmin's instance type dialog is a
// UnitVmModel and runs NotEmpty + Length + I18NNameValidation, the same rules
// the Edit VM / Clone VM dialogs use, so reuse vmNameError for identical
// inline feedback instead of bouncing a raw engine fault.
export const instanceTypeNameError = vmNameError
