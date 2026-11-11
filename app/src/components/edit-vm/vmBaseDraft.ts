import type { MessageId } from '../../i18n/messages/en'

// ── Reusable VmBase sections: the contract ──────────────────────────────────
//
// In the api-model, Vm, Template and InstanceType all extend VmBase, and a pool
// carries its VM configuration as a VmBase too. Webadmin edits every one of
// them with the same UnitVmModel tab set, so the Edit VM sections that cover
// pure VmBase fields are shared:
//
//   SystemSection             SystemFields            (+ overcommitPercent, topologyLocked)
//   ConsoleSection            ConsoleFields           (+ allowHeadless, allContent)
//   HighAvailabilitySection   HighAvailabilityFields  (+ watchdog: VM-only, opt-in)
//   ResourceAllocationSection ResourceAllocationFields (+ cpuProfiles query,
//                                                       allContent,
//                                                       tpm: VM-only, opt-in)
//   CustomPropertiesSection   CustomPropertiesFields
//   IconSection               IconFields
//
// Every shared section takes:
//   draft     its slice (the interface named above). Pass the whole form draft:
//             any draft that extends the slice fits.
//   onChange  (patch: Partial<Slice>) => void. Merge the patch into the draft.
//             A patch, not a keyed setter, so a form whose draft is wider than
//             the slice can pass its own merge function unchanged.
//   idPrefix  element-id namespace ('edit-vm' by default), so two forms never
//             share ids.
//   context   the few extra props listed above. Sections never read a form's
//             own state (VM status, template id, ...) directly.
//
// A form adopts the sections in four steps:
//   1. Its draft interface extends VmBaseDraft (or only the slices it shows).
//   2. Seed with vmBaseToDraft(readModel) and keep that seed as the BASELINE.
//   3. Build the body with vmBaseChangedPayload(draft, baseline), which sends
//      only what moved, so the engine's per-field isSet guards keep the rest.
//      (Edit VM keeps its always-sent core body and adds applyVmBaseChanges.)
//   4. Gate Save on vmMemoryError(draft).
// A form that edits an existing entity also seeds the device flags from an
// all_content read (see "All-content device flags" below).
// The cpu-profile list is useCpuProfileOptions(clusterId) (vmBaseQueries.ts).
// TemplateFormModal is the reference consumer outside Edit VM.

// Memory rides in bytes on the wire and in integer MiB in the draft.
const MiB = 1024 * 1024

// Webadmin's Maximum memory default ratio (VmCommonUtils.getMaxMemorySizeDefault).
export const MAX_MEMORY_RATIO = 4

// Over-commit % assumed when the cluster's is unknown (no over-commit).
const DEFAULT_OVERCOMMIT_PERCENT = 100

// What a section hands back: the changed fields of its slice.
export type SectionChange<S> = (patch: Partial<S>) => void

// A keyed setter over a section's onChange, for one-field inputs.
export function fieldSetter<S>(onChange: SectionChange<S>) {
  return <K extends keyof S>(key: K, value: S[K]) => {
    const patch: Partial<S> = {}
    patch[key] = value
    onChange(patch)
  }
}

// One key/value row in the Custom Properties section. Always strings so the
// row's inputs stay controlled.
export interface CustomPropertyRow {
  name: string
  value: string
}

export interface MemoryFields {
  // integer MiB (the engine granularity); the System section edits it in GiB
  memoryMb: number
  maxMemoryMb: number
  guaranteedMemoryMb: number
}

export interface SystemFields extends MemoryFields {
  sockets: number
  coresPerSocket: number
  threadsPerCore: number
  // hardware-clock time zone ('' = engine default; time_zone.name)
  hardwareClockTimezone: string
  // SMBIOS serial-number policy ('' = cluster default | 'host' | 'vm' |
  // 'custom') with its custom value
  serialNumberPolicy: string
  customSerialNumber: string
  // per-entity overrides of the cluster's machine type / CPU model ('' = cluster default)
  customEmulatedMachine: string
  customCpuModel: string
}

export interface ConsoleFields {
  // 'spice' | 'vnc' | 'headless' (headless = no graphics device)
  graphicsProtocol: string
  // '' = engine default
  vncKeyboardLayout: string
  monitors: number
  usbEnabled: boolean
  smartcardEnabled: boolean
  // guest single sign-on (sso.methods carries guest_agent)
  ssoEnabled: boolean
  spiceFileTransfer: boolean
  spiceCopyPaste: boolean
  soundcardEnabled: boolean
  serialConsoleEnabled: boolean
  // '' = engine default
  disconnectAction: string
}

export interface HighAvailabilityFields {
  haEnabled: boolean
  haPriority: number
  // lease.storage_domain.id ('' = no lease)
  leaseStorageDomainId: string
  // resume behavior after a storage I/O error pause
  storageErrorResumeBehaviour: string
}

// VM only: the watchdog device lives in /vms/{id}/watchdogs, not on the VM
// read. The draft seeds it "not loaded" and the modal folds the device into
// both draft and baseline once the read lands; watchdogLoaded gates the selects
// and the save. watchdogId '' = no device; watchdogModel '' = "No watchdog".
export interface WatchdogFields {
  watchdogLoaded: boolean
  watchdogId: string
  watchdogModel: string
  watchdogAction: string
}

// VM only: the TPM device (tpm_enabled). Like the device flags below it is
// filled on an all_content read only, so Edit VM seeds it with them (its
// devicesLoaded gates the toggle and the payload). Templates and instance types
// do not edit it.
export interface TpmFields {
  tpmEnabled: boolean
}

// ── All-content device flags ─────────────────────────────────────────────────
//
// Serial console, sound card and VirtIO-SCSI are devices, not entity fields:
// the engine sets console, soundcard_enabled and virtio_scsi only in the
// resources' doPopulate, which runs for an all_content read alone, and no
// mapper maps them from the entity (BackendVm/Template(s)/InstanceType(s)
// Resource, ovirt-engine 4.5). A plain read therefore reports them as absent,
// and a form seeded from it would show a device the entity has as off. A form
// that edits an existing entity:
//   1. extends DeviceLoadFields and seeds allContentDeviceFields(undefined)
//      (placeholders, devicesLoaded false) over vmBaseToDraft's values;
//   2. folds allContentDeviceFields(read) into BOTH draft and baseline once its
//      all_content read lands;
//   3. passes allContent={{ loaded: draft.devicesLoaded, failed }} to
//      ConsoleSection and ResourceAllocationSection: a skeleton while loading,
//      the switches disabled until loaded (the form says why when it failed);
//   4. builds the body with { devicesRead: draft.devicesLoaded &&
//      baseline.devicesLoaded }, so an unread device is never written.
// Sections given no allContent show those switches as plain controls (a create
// form whose defaults are its own).

// The device flags an all_content read carries for any VmBase entity.
export interface VmBaseAllContentDevices {
  serialConsoleEnabled: boolean
  soundcardEnabled: boolean
  virtioScsiEnabled: boolean
}

// Whether the form's draft holds the all_content read's device flags yet.
export interface DeviceLoadFields {
  devicesLoaded: boolean
}

// The section prop for those flags: the read landed (and was folded into the
// draft), or it failed.
export interface AllContentState {
  loaded: boolean
  failed: boolean
}

// The draft fields for an all_content read (undefined: not read yet, the
// placeholders a form seeds with).
export function allContentDeviceFields(
  devices: VmBaseAllContentDevices | undefined,
): VmBaseAllContentDevices & DeviceLoadFields {
  return {
    devicesLoaded: devices !== undefined,
    serialConsoleEnabled: devices?.serialConsoleEnabled ?? false,
    soundcardEnabled: devices?.soundcardEnabled ?? false,
    virtioScsiEnabled: devices?.virtioScsiEnabled ?? false,
  }
}

// What applyVmBaseChanges / vmBaseChangedPayload may send. devicesRead false
// keeps the all_content device keys (console, soundcard_enabled, virtio_scsi)
// out of the body: the draft holds placeholders for them, not the entity's
// devices. Absent ⇒ true, for a form whose device values are its own.
export interface VmBaseChangeOptions {
  devicesRead?: boolean
}

export interface ResourceAllocationFields {
  cpuProfileId: string
  cpuShares: number
  memoryBalloonEnabled: boolean
  ioThreads: number
  virtioScsiEnabled: boolean
  // VirtIO-SCSI multi-queue (0 queues = auto-derive) and vNIC multi-queues
  virtioScsiMultiQueuesEnabled: boolean
  virtioScsiMultiQueues: number
  multiQueuesEnabled: boolean
}

export interface CustomPropertiesFields {
  customProperties: CustomPropertyRow[]
}

export interface IconFields {
  // The referenced icon id (large_icon.id) plus an optional custom upload
  // (base64 data + media type). A custom upload wins; picking a catalog icon
  // clears the upload.
  iconId: string
  iconUploadData: string
  iconUploadMediaType: string
}

// Every VmBase field the shared sections edit. Always defined (never undefined)
// so controlled inputs never flip between controlled and uncontrolled.
export interface VmBaseDraft
  extends
    SystemFields,
    ConsoleFields,
    HighAvailabilityFields,
    ResourceAllocationFields,
    CustomPropertiesFields,
    IconFields {}

// The VmBase read-model fields vmBaseToDraft reads. Structural, so the Vm and
// Template read models (and later InstanceType) fit it as they are; booleans
// and numbers are already coerced by the zod schemas.
export interface VmBaseRead {
  memory?: number
  memory_policy?: { guaranteed?: number; max?: number; ballooning?: boolean }
  cpu?: { topology?: { sockets?: number; cores?: number; threads?: number } }
  high_availability?: { enabled?: boolean; priority?: number }
  lease?: { storage_domain?: { id?: string } }
  storage_error_resume_behaviour?: string
  display?: {
    type?: string
    monitors?: number
    disconnect_action?: string
    keyboard_layout?: string
    smartcard_enabled?: boolean
    file_transfer_enabled?: boolean
    copy_paste_enabled?: boolean
  }
  usb?: { enabled?: boolean }
  soundcard_enabled?: boolean
  console?: { enabled?: boolean }
  sso?: { methods?: { method?: { id?: string }[] } }
  time_zone?: { name?: string }
  serial_number?: { policy?: string; value?: string }
  custom_emulated_machine?: string
  custom_cpu_model?: string
  cpu_profile?: { id?: string }
  cpu_shares?: number
  io?: { threads?: number }
  virtio_scsi?: { enabled?: boolean }
  multi_queues_enabled?: boolean
  virtio_scsi_multi_queues_enabled?: boolean
  virtio_scsi_multi_queues?: number
  custom_properties?: { custom_property?: { name?: string; value?: string }[] }
}

// Round bytes → MiB; an absent value collapses to 0 rather than NaN.
function bytesToMb(bytes: number | undefined): number {
  return bytes === undefined ? 0 : Math.round(bytes / MiB)
}

// 'spice' / 'vnc' when set, otherwise 'headless' (no graphics device: the type
// is absent, empty, or unknown), as webadmin derives IsHeadlessModeEnabled.
function graphicsProtocolOf(source: VmBaseRead): string {
  const type = source.display?.type
  return type === 'spice' || type === 'vnc' ? type : 'headless'
}

// The engine omits the wrapper (or the inner array) when no property is set.
function customPropertyRows(source: VmBaseRead): CustomPropertyRow[] {
  const rows = source.custom_properties?.custom_property
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({ name: row.name ?? '', value: row.value ?? '' }))
}

// VmBase read model → the shared slice of a draft. Every optional wire field
// gets a concrete fallback. iconId is the large_icon link id, which a caller
// passes because not every read model declares large_icon.
export function vmBaseToDraft(source: VmBaseRead, iconId = ''): VmBaseDraft {
  const memoryMb = bytesToMb(source.memory)
  return {
    memoryMb,
    maxMemoryMb: bytesToMb(source.memory_policy?.max),
    // A loaded guaranteed above memory is invalid (the engine requires
    // guaranteed <= memory): clamp it on open, as webadmin recomputes it.
    guaranteedMemoryMb: Math.min(bytesToMb(source.memory_policy?.guaranteed), memoryMb),
    sockets: source.cpu?.topology?.sockets ?? 1,
    coresPerSocket: source.cpu?.topology?.cores ?? 1,
    threadsPerCore: source.cpu?.topology?.threads ?? 1,
    hardwareClockTimezone: source.time_zone?.name ?? '',
    serialNumberPolicy: source.serial_number?.policy ?? '',
    customSerialNumber: source.serial_number?.value ?? '',
    customEmulatedMachine: source.custom_emulated_machine ?? '',
    customCpuModel: source.custom_cpu_model ?? '',
    haEnabled: source.high_availability?.enabled ?? false,
    haPriority: source.high_availability?.priority ?? 1,
    leaseStorageDomainId: source.lease?.storage_domain?.id ?? '',
    storageErrorResumeBehaviour: source.storage_error_resume_behaviour ?? 'auto_resume',
    monitors: source.display?.monitors ?? 1,
    usbEnabled: source.usb?.enabled ?? false,
    disconnectAction: source.display?.disconnect_action ?? '',
    graphicsProtocol: graphicsProtocolOf(source),
    vncKeyboardLayout: source.display?.keyboard_layout ?? '',
    smartcardEnabled: source.display?.smartcard_enabled ?? false,
    soundcardEnabled: source.soundcard_enabled ?? false,
    serialConsoleEnabled: source.console?.enabled ?? false,
    // SSO is on when the guest_agent method is present; the SPICE channels
    // default ON (the engine's own default when the keys are absent).
    ssoEnabled: (source.sso?.methods?.method ?? []).some((method) => method.id === 'guest_agent'),
    spiceFileTransfer: source.display?.file_transfer_enabled ?? true,
    spiceCopyPaste: source.display?.copy_paste_enabled ?? true,
    multiQueuesEnabled: source.multi_queues_enabled ?? true,
    virtioScsiMultiQueuesEnabled: source.virtio_scsi_multi_queues_enabled ?? false,
    virtioScsiMultiQueues: source.virtio_scsi_multi_queues ?? 0,
    cpuProfileId: source.cpu_profile?.id ?? '',
    cpuShares: source.cpu_shares ?? 0,
    // Ballooning defaults on (webadmin default) when the engine omits it.
    memoryBalloonEnabled: source.memory_policy?.ballooning ?? true,
    ioThreads: source.io?.threads ?? 0,
    virtioScsiEnabled: source.virtio_scsi?.enabled ?? false,
    customProperties: customPropertyRows(source),
    iconId,
    iconUploadData: '',
    iconUploadMediaType: '',
  }
}

// Structural inequality via JSON: the values are plain scalars/arrays/records
// built by the same code path on both sides, so a stringify compare is exact.
export function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}

// The nested object `key` of a payload, created when the body does not carry
// it yet (Edit VM's base body always does; a diff-only body may not).
function child(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = payload[key]
  if (current !== null && typeof current === 'object') return current as Record<string, unknown>
  const created: Record<string, unknown> = {}
  payload[key] = created
  return created
}

// The serial_number body. host/vm carry only the policy; custom pairs it with
// the value; '' (the cluster-default choice) maps to policy 'none', which the
// api-model documents as "remove the policy, moving it to the default (null)".
export function buildSerialNumber(draft: SystemFields): Record<string, unknown> {
  if (draft.serialNumberPolicy === '') return { policy: 'none' }
  if (draft.serialNumberPolicy === 'custom') {
    return { policy: 'custom', value: draft.customSerialNumber }
  }
  return { policy: draft.serialNumberPolicy }
}

// The large_icon body for save, or undefined when the icon is unchanged. A
// custom upload (base64 data present) takes precedence over a catalog id.
export function buildLargeIcon(
  draft: IconFields,
  baseline: IconFields,
): Record<string, unknown> | undefined {
  if (draft.iconUploadData !== '') {
    return { media_type: draft.iconUploadMediaType, data: draft.iconUploadData }
  }
  if (draft.iconId !== '' && draft.iconId !== baseline.iconId) {
    return { id: draft.iconId }
  }
  return undefined
}

// The wire-shape rows: only named properties count (an unnamed row is UI
// noise, not a directive to the engine).
export function normalizedCustomProperties(draft: CustomPropertiesFields): CustomPropertyRow[] {
  return draft.customProperties.filter((row) => row.name.trim() !== '')
}

// Add the changed VmBase depth fields (everything the shared sections edit
// except the core memory/topology/HA/monitors/USB set) to `payload`. Each key
// rides only when it moved from the baseline: webadmin's omit-unchanged
// discipline, so the engine's per-field isSet guards keep whatever the body
// does not mention. Fields that live in a nested block (display, memory_policy)
// are added to the block the payload already carries, or to a new one.
export function applyVmBaseChanges(
  payload: Record<string, unknown>,
  draft: VmBaseDraft,
  baseline: VmBaseDraft,
  { devicesRead = true }: VmBaseChangeOptions = {},
): void {
  // Resource Allocation.
  if (draft.cpuProfileId && draft.cpuProfileId !== baseline.cpuProfileId) {
    payload.cpu_profile = { id: draft.cpuProfileId }
  }
  if (draft.cpuShares !== baseline.cpuShares) payload.cpu_shares = draft.cpuShares
  if (draft.memoryBalloonEnabled !== baseline.memoryBalloonEnabled) {
    child(payload, 'memory_policy').ballooning = draft.memoryBalloonEnabled
  }
  if (draft.ioThreads !== baseline.ioThreads) payload.io = { threads: draft.ioThreads }
  if (devicesRead && draft.virtioScsiEnabled !== baseline.virtioScsiEnabled) {
    payload.virtio_scsi = { enabled: draft.virtioScsiEnabled }
  }
  // Queue tuning. The VirtIO-SCSI queue COUNT only rides while the multi-queue
  // toggle is on and a positive count is set (0 = auto-derive, the engine
  // default when the key is absent).
  if (draft.multiQueuesEnabled !== baseline.multiQueuesEnabled) {
    payload.multi_queues_enabled = draft.multiQueuesEnabled
  }
  if (
    draft.virtioScsiMultiQueuesEnabled !== baseline.virtioScsiMultiQueuesEnabled ||
    (draft.virtioScsiMultiQueuesEnabled &&
      draft.virtioScsiMultiQueues !== baseline.virtioScsiMultiQueues)
  ) {
    payload.virtio_scsi_multi_queues_enabled = draft.virtioScsiMultiQueuesEnabled
    if (draft.virtioScsiMultiQueuesEnabled && draft.virtioScsiMultiQueues > 0) {
      payload.virtio_scsi_multi_queues = draft.virtioScsiMultiQueues
    }
  }

  // Console. Graphics protocol / VNC keyboard / smartcard / SPICE channels ride
  // the display block; soundcard and serial console are their own keys.
  // spice/vnc set display.type; headless is "remove the graphics device", which
  // display.type cannot express (a graphics_consoles DELETE), so it is never
  // written here. The form either performs that removal itself (Edit VM) or
  // does not offer headless (ConsoleSection allowHeadless).
  if (
    draft.graphicsProtocol !== baseline.graphicsProtocol &&
    draft.graphicsProtocol !== 'headless'
  ) {
    child(payload, 'display').type = draft.graphicsProtocol
  }
  if (draft.vncKeyboardLayout !== baseline.vncKeyboardLayout) {
    // '' clears the stored layout back to the engine default.
    child(payload, 'display').keyboard_layout = draft.vncKeyboardLayout
  }
  if (draft.smartcardEnabled !== baseline.smartcardEnabled) {
    child(payload, 'display').smartcard_enabled = draft.smartcardEnabled
  }
  if (draft.spiceFileTransfer !== baseline.spiceFileTransfer) {
    child(payload, 'display').file_transfer_enabled = draft.spiceFileTransfer
  }
  if (draft.spiceCopyPaste !== baseline.spiceCopyPaste) {
    child(payload, 'display').copy_paste_enabled = draft.spiceCopyPaste
  }
  // Both are all_content device flags: sent only once they were read.
  if (devicesRead && draft.soundcardEnabled !== baseline.soundcardEnabled) {
    payload.soundcard_enabled = draft.soundcardEnabled
  }
  if (devicesRead && draft.serialConsoleEnabled !== baseline.serialConsoleEnabled) {
    payload.console = { enabled: draft.serialConsoleEnabled }
  }
  // Guest single sign-on. Enabling sends the guest_agent method; disabling
  // sends a PRESENT-but-empty method list (the engine's SsoMapper maps a
  // set-but-empty list to "no methods").
  if (draft.ssoEnabled !== baseline.ssoEnabled) {
    payload.sso = {
      methods: { method: draft.ssoEnabled ? [{ id: 'guest_agent' }] : [] },
    }
  }

  // System. '' clears an emulated machine / CPU model override back to the
  // cluster default (the engine stores the empty value as "no override";
  // webadmin sends null, which a JSON body cannot express).
  if (draft.customEmulatedMachine !== baseline.customEmulatedMachine) {
    payload.custom_emulated_machine = draft.customEmulatedMachine
  }
  if (draft.customCpuModel !== baseline.customCpuModel) {
    payload.custom_cpu_model = draft.customCpuModel
  }
  // Hardware-clock time zone. '' clears it to the engine default.
  if (draft.hardwareClockTimezone !== baseline.hardwareClockTimezone) {
    payload.time_zone = { name: draft.hardwareClockTimezone }
  }
  // SMBIOS serial number: sent when the policy or, for custom, its value moved.
  const serialMoved =
    draft.serialNumberPolicy !== baseline.serialNumberPolicy ||
    (draft.serialNumberPolicy === 'custom' &&
      draft.customSerialNumber !== baseline.customSerialNumber)
  if (serialMoved) payload.serial_number = buildSerialNumber(draft)

  // High Availability. Resume behavior after a storage I/O error pause; the
  // lease target, where clearing it sends the empty-object removal convention
  // (the empty-tag clear the model documents for `initialization`; UNVERIFIED
  // for `lease` against a live engine).
  if (draft.storageErrorResumeBehaviour !== baseline.storageErrorResumeBehaviour) {
    payload.storage_error_resume_behaviour = draft.storageErrorResumeBehaviour
  }
  if (draft.leaseStorageDomainId !== baseline.leaseStorageDomainId) {
    payload.lease =
      draft.leaseStorageDomainId === ''
        ? {}
        : { storage_domain: { id: draft.leaseStorageDomainId } }
  }

  // Custom Properties: CLEAR-TO-NONE. A present-but-empty custom_property list
  // clears every property (webadmin semantics), an absent key preserves them,
  // so the block is only sent when the named rows actually changed.
  const properties = normalizedCustomProperties(draft)
  if (changed(properties, normalizedCustomProperties(baseline))) {
    payload.custom_properties = { custom_property: properties }
  }

  // Icon: a staged custom upload sends the inline { media_type, data } (the
  // engine creates a new icon and binds it); a different catalog icon sends
  // { id }. Absent when nothing changed.
  const icon = buildLargeIcon(draft, baseline)
  if (icon !== undefined) payload.large_icon = icon
}

// The changed core fields (memory, CPU topology, HA, monitors, USB, disconnect
// action) for a diff-only body. Edit VM always sends these in its base body
// instead. Memory limits ride only when positive: 0 means "let the engine
// default it", and a sent 0 would be rejected. The topology goes as a whole
// when any count moved.
export function applyVmBaseCoreChanges(
  payload: Record<string, unknown>,
  draft: VmBaseDraft,
  baseline: VmBaseDraft,
): void {
  if (draft.memoryMb !== baseline.memoryMb) payload.memory = draft.memoryMb * MiB
  if (draft.maxMemoryMb !== baseline.maxMemoryMb && draft.maxMemoryMb > 0) {
    child(payload, 'memory_policy').max = draft.maxMemoryMb * MiB
  }
  if (draft.guaranteedMemoryMb !== baseline.guaranteedMemoryMb && draft.guaranteedMemoryMb > 0) {
    child(payload, 'memory_policy').guaranteed = draft.guaranteedMemoryMb * MiB
  }
  if (
    draft.sockets !== baseline.sockets ||
    draft.coresPerSocket !== baseline.coresPerSocket ||
    draft.threadsPerCore !== baseline.threadsPerCore
  ) {
    child(payload, 'cpu').topology = {
      sockets: draft.sockets,
      cores: draft.coresPerSocket,
      threads: draft.threadsPerCore,
    }
  }
  if (draft.haEnabled !== baseline.haEnabled || draft.haPriority !== baseline.haPriority) {
    payload.high_availability = { enabled: draft.haEnabled, priority: draft.haPriority }
  }
  if (draft.monitors !== baseline.monitors) child(payload, 'display').monitors = draft.monitors
  if (draft.usbEnabled !== baseline.usbEnabled) payload.usb = { enabled: draft.usbEnabled }
  if (draft.disconnectAction && draft.disconnectAction !== baseline.disconnectAction) {
    child(payload, 'display').disconnect_action = draft.disconnectAction
  }
}

// Every changed VmBase field as a diff-only body: {} when nothing moved.
export function vmBaseChangedPayload(
  draft: VmBaseDraft,
  baseline: VmBaseDraft,
  options: VmBaseChangeOptions = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  applyVmBaseCoreChanges(payload, draft, baseline)
  applyVmBaseChanges(payload, draft, baseline, options)
  return payload
}

// ── Memory derivation and validation (System section) ────────────────────────

// Physical Memory Guaranteed the way webadmin derives it: floor(memory * 100 /
// over-commit-percent), never above the memory size. (int) truncation in GWT's
// calcMinMemory is mirrored with Math.floor so parity is exact; the engine
// invariant guaranteed <= memory is always satisfied because the factor is <= 1
// for percent >= 100. A 0/undefined percent falls back to 100 (guaranteed ==
// memory) rather than dividing by zero.
export function guaranteedForMemory(memoryMb: number, overcommitPercent?: number): number {
  const percent =
    overcommitPercent !== undefined && overcommitPercent > 0
      ? overcommitPercent
      : DEFAULT_OVERCOMMIT_PERCENT
  return Math.min(Math.floor((memoryMb * 100) / percent), memoryMb)
}

// Re-derive the dependent memory fields when Memory Size is committed, mirroring
// webadmin's memSize_EntityChanged (updateMaxMemory + updateMinAllocatedMemory):
//  • Maximum memory = memory * 4 (getMaxMemorySizeDefault); the client has no
//    OS/arch cap locally, so no Math.min ceiling is applied — the engine rejects
//    an over-cap max. Max is never left below memory.
//  • Physical Memory Guaranteed = guaranteedForMemory(memory, over-commit),
//    which is <= memory, so this also CORRECTS a loaded state where guaranteed
//    exceeded memory (e.g. 4096 guaranteed against 1024 memory).
// Faithful to webadmin's "recompute from the new memory" rather than a per-field
// tracking flag. Returns the whole next draft.
export function deriveMemoryOnCommit<D extends MemoryFields>(
  draft: D,
  overcommitPercent?: number,
): D {
  return {
    ...draft,
    maxMemoryMb: draft.memoryMb * MAX_MEMORY_RATIO,
    guaranteedMemoryMb: guaranteedForMemory(draft.memoryMb, overcommitPercent),
  }
}

// Memory relationship validation (webadmin parity): the engine requires
// guaranteed <= memory <= max. Surface it inline so the user sees why a save
// would bounce rather than eating a raw fault. max is only checked when set
// (0 means "let the engine default it"). Returns undefined when consistent.
export function vmMemoryError(draft: MemoryFields): MessageId | undefined {
  if (draft.memoryMb <= 0) return 'templateForm.memory.error.positive'
  if (draft.guaranteedMemoryMb > draft.memoryMb) {
    return 'templateForm.memory.error.guaranteed'
  }
  if (draft.maxMemoryMb > 0 && draft.maxMemoryMb < draft.memoryMb) {
    return 'templateForm.memory.error.max'
  }
  return undefined
}
