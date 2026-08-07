import { vmLargeIconId } from '../../api/resources/icons'
import type { Vm } from '../../api/schemas/vm'
import type { MessageId } from '../../i18n/messages/en'
import { statusKind } from '../../lib/vm-status'

// Memory is stored in bytes on the wire (see schemas/vm.ts) but edited in MiB
// in the modal — convert at the draft boundary so every section works in MiB.
const MiB = 1024 * 1024

// The System section EDITS memory in GiB (webadmin/admin convention) while the
// draft keeps the authoritative integer MiB. oVirt "GiB" is 1024 MiB regardless
// of the field label wording, so the display divisor is fixed at 1024.
const MIB_PER_GIB = 1024

// Webadmin seeds Maximum memory at 4x the memory size
// (VmCommonUtils.getMaxMemorySizeDefault → maxMemoryDefaultRatio = 4). We mirror
// that so committing a new Memory Size re-derives Max the way the GWT dialog does.
const MAX_MEMORY_RATIO = 4

// Physical Memory Guaranteed defaults to memory * 100 / cluster-over-commit-%
// (VmCommonUtils.calcMinMemory). With the usual 100% (no over-commit) this is
// exactly the memory size; a cluster that over-commits (>100%) yields a lower
// guaranteed. When the cluster percent is unknown fall back to 100.
const DEFAULT_OVERCOMMIT_PERCENT = 100

// The shared, flat draft the Edit Virtual Machine modal owns and each section
// component reads/writes. Every field is always defined (never undefined) so
// controlled inputs never flip between controlled/uncontrolled — optional wire
// values collapse to '' / 0 / false / a sensible default here.
export interface EditVmDraft {
  // General
  name: string
  description: string
  comment: string
  clusterId: string
  osType: string
  optimizedFor: string // 'desktop' | 'server' | 'high_performance'
  stateless: boolean
  deleteProtected: boolean
  // System — memory (MiB) and CPU topology
  memoryMb: number
  maxMemoryMb: number
  guaranteedMemoryMb: number
  sockets: number
  coresPerSocket: number
  threadsPerCore: number
  // High Availability
  haEnabled: boolean
  haPriority: number
  // VM lease target storage domain id ('' = no lease). lease.storage_domain.id.
  leaseStorageDomainId: string
  // Console
  monitors: number
  usbEnabled: boolean
  disconnectAction: string
  // Console depth — graphics protocol ('spice' | 'vnc' | 'headless'; headless =
  // removing the graphics device), VNC keyboard layout ('' = engine default),
  // and the smartcard/soundcard/serial-console device toggles.
  graphicsProtocol: string
  vncKeyboardLayout: string
  smartcardEnabled: boolean
  soundcardEnabled: boolean
  serialConsoleEnabled: boolean
  // Boot Options
  firstBootDevice: string
  secondBootDevice: string
  bootMenuEnabled: boolean
  // Boot depth — the immutable VM id (lets the CD picker read the current tray),
  // the ISO to insert on the next boot, and whether the user actually touched
  // the CD picker (guards an untouched picker from ejecting the current CD). The
  // attached CD rides the vm cdroms subcollection, NOT the vm PUT body.
  id: string
  attachedCdId: string
  cdTouched: boolean
  // Boot depth — custom direct-kernel boot (os.kernel / os.initrd / os.cmdline).
  kernelPath: string
  initrdPath: string
  kernelParams: string
  // System depth — hardware-clock time zone ('' = engine default;
  // time_zone.name) and the SMBIOS serial-number policy ('' = cluster default |
  // 'host' | 'vm' | 'custom') with its custom value.
  hardwareClockTimezone: string
  serialNumberPolicy: string
  customSerialNumber: string
  // Initial Run — cloud-init (Linux) / sysprep (Windows). The initialization
  // block is only PUT when initialRunEnabled and a field actually changed, so an
  // untouched Initial Run never clobbers the engine's write-only secrets.
  initialRunEnabled: boolean
  cloudInitHostname: string
  cloudInitUserName: string
  cloudInitPassword: string
  cloudInitSshKeys: string
  cloudInitRegenerateSsh: boolean
  cloudInitDnsServers: string
  cloudInitDnsSearch: string
  cloudInitTimezone: string
  cloudInitCustomScript: string
  cloudInitNics: InitialRunNic[]
  // Sysprep (Windows OS types)
  sysprepDomain: string
  sysprepTimezone: string
  sysprepAdminPassword: string
  sysprepCustomScript: string
  // Host — placement policy + CPU pass-through
  startRunningOn: StartRunningOn
  placementHostIds: string[]
  migrationMode: string
  hostPassthroughCpu: boolean
  // Resource Allocation
  cpuProfileId: string
  cpuShares: number
  memoryBalloonEnabled: boolean
  ioThreads: number
  virtioScsiEnabled: boolean
  // Random Generator — virtio-rng device (enable + entropy source + optional
  // rate limit; 0 on either rate field means "unlimited / not set")
  rngEnabled: boolean
  rngSource: string
  rngBytes: number
  rngPeriod: number
  // Custom Properties — key/value rows mapping to custom_properties
  customProperties: CustomPropertyRow[]
  // Icon — the referenced catalog icon id (seeded from vm.large_icon.id) plus an
  // optional custom upload (base64 data + media type). A custom upload wins;
  // picking a catalog icon clears the upload. Both map to large_icon on save.
  iconId: string
  iconUploadData: string
  iconUploadMediaType: string
}

// One key/value row in the Custom Properties section. Always strings so the
// row's inputs stay controlled.
export interface CustomPropertyRow {
  name: string
  value: string
}

// One static NIC row in the Initial Run cloud-init network config. Every field
// is always a string so the row's inputs stay controlled.
export interface InitialRunNic {
  name: string
  address: string
  netmask: string
  gateway: string
}

// "Start Running On": any host in the cluster vs a pinned subset. Maps to the
// presence of placement_policy.hosts.
export type StartRunningOn = 'any' | 'specific'

// Boot devices arrive as vm.os.boot.devices.device: string[]; VmSchema types
// that inner object loosely, so read it defensively.
function bootDevices(vm: Vm): string[] {
  const devices = (vm.os?.boot?.devices as { device?: string[] } | undefined)?.device
  return Array.isArray(devices) ? devices : []
}

// Round bytes → MiB; an absent value collapses to 0 rather than NaN so the
// number inputs stay controlled.
function bytesToMb(bytes: number | undefined): number {
  return bytes === undefined ? 0 : Math.round(bytes / MiB)
}

// Graphics protocol from the loaded display block: 'spice' / 'vnc' when set,
// otherwise 'headless' (the VM carries no graphics device — display.type is
// absent, empty, or an unknown value). Mirrors webadmin's IsHeadlessModeEnabled
// being derived from the absence of a graphics protocol.
function graphicsProtocolOf(vm: Vm): string {
  const type = vm.display?.type
  return type === 'spice' || type === 'vnc' ? type : 'headless'
}

// Windows OS types (os.type "windows_*") drive the Initial Run tab to sysprep
// instead of cloud-init — the same prefix convention the osinfo catalog uses.
export function isWindowsOsType(osType: string | undefined): boolean {
  return (osType ?? '').toLowerCase().startsWith('windows')
}

// Read the static NIC rows out of a loaded initialization block. The engine
// only returns configured NICs; each collapses to the four editable strings.
function initialNics(vm: Vm): InitialRunNic[] {
  const rows = vm.initialization?.nic_configurations?.nic_configuration
  if (!Array.isArray(rows)) return []
  return rows.map((nic) => ({
    name: nic.name ?? '',
    address: nic.ip?.address ?? '',
    netmask: nic.ip?.netmask ?? '',
    gateway: nic.ip?.gateway ?? '',
  }))
}

// Read the custom-property rows off the VM. The engine omits the wrapper (or
// the inner array) when none are set.
function customPropertyRows(vm: Vm): CustomPropertyRow[] {
  const rows = vm.custom_properties?.custom_property
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({ name: row.name ?? '', value: row.value ?? '' }))
}

// Loaded placement host ids (the pinned subset). The engine returns bare
// { id, href } links; names are resolved client-side in the Host section.
function placementHostIds(vm: Vm): string[] {
  const hosts = vm.placement_policy?.hosts?.host
  if (!Array.isArray(hosts)) return []
  return hosts.map((host) => host.id ?? '').filter(Boolean)
}

// Vm read model → fully-populated draft. Every optional wire field is given a
// concrete fallback so the returned draft has no undefined members.
export function vmToDraft(vm: Vm): EditVmDraft {
  const devices = bootDevices(vm)
  const memoryMb = bytesToMb(vm.memory)
  const init = vm.initialization
  const hostIds = placementHostIds(vm)
  return {
    name: vm.name ?? '',
    description: vm.description ?? '',
    comment: vm.comment ?? '',
    clusterId: vm.cluster?.id ?? '',
    osType: vm.os?.type ?? '',
    optimizedFor: vm.type ?? 'server',
    stateless: vm.stateless ?? false,
    deleteProtected: vm.delete_protected ?? false,
    memoryMb,
    maxMemoryMb: bytesToMb(vm.memory_policy?.max),
    // A loaded guaranteed above memory is invalid (the engine requires
    // guaranteed <= memory) — clamp it down on open, the way webadmin recomputes
    // guaranteed when the dialog loads. Fixes the 4096-guaranteed-vs-1024-memory
    // state without a save-block.
    guaranteedMemoryMb: Math.min(bytesToMb(vm.memory_policy?.guaranteed), memoryMb),
    sockets: vm.cpu?.topology?.sockets ?? 1,
    coresPerSocket: vm.cpu?.topology?.cores ?? 1,
    threadsPerCore: vm.cpu?.topology?.threads ?? 1,
    haEnabled: vm.high_availability?.enabled ?? false,
    haPriority: vm.high_availability?.priority ?? 1,
    leaseStorageDomainId: vm.lease?.storage_domain?.id ?? '',
    monitors: vm.display?.monitors ?? 1,
    usbEnabled: vm.usb?.enabled ?? false,
    disconnectAction: vm.display?.disconnect_action ?? '',
    graphicsProtocol: graphicsProtocolOf(vm),
    vncKeyboardLayout: vm.display?.keyboard_layout ?? '',
    smartcardEnabled: vm.display?.smartcard_enabled ?? false,
    soundcardEnabled: vm.soundcard_enabled ?? false,
    serialConsoleEnabled: vm.console?.enabled ?? false,
    firstBootDevice: devices[0] ?? '',
    secondBootDevice: devices[1] ?? '',
    bootMenuEnabled: vm.bios?.boot_menu?.enabled ?? false,
    id: vm.id ?? '',
    // The vm read carries no cdroms subcollection, so the current tray is
    // unknown until the Boot section fetches it; default to '' (untouched).
    attachedCdId: '',
    cdTouched: false,
    kernelPath: vm.os?.kernel ?? '',
    initrdPath: vm.os?.initrd ?? '',
    kernelParams: vm.os?.cmdline ?? '',
    hardwareClockTimezone: vm.time_zone?.name ?? '',
    serialNumberPolicy: vm.serial_number?.policy ?? '',
    customSerialNumber: vm.serial_number?.value ?? '',
    // Initial Run: treat a VM that already carries an initialization block as
    // "enabled". root_password/authorized_ssh_keys are write-only on the wire,
    // so they seed to '' and are only PUT when the user types a new value.
    initialRunEnabled: init !== undefined,
    cloudInitHostname: init?.host_name ?? '',
    cloudInitUserName: init?.user_name ?? '',
    cloudInitPassword: '',
    cloudInitSshKeys: init?.authorized_ssh_keys ?? '',
    cloudInitRegenerateSsh: init?.regenerate_ssh_keys ?? false,
    cloudInitDnsServers: init?.dns_servers ?? '',
    cloudInitDnsSearch: init?.dns_search ?? '',
    cloudInitTimezone: init?.timezone ?? '',
    cloudInitCustomScript: init?.custom_script ?? '',
    cloudInitNics: initialNics(vm),
    sysprepDomain: init?.domain ?? '',
    sysprepTimezone: init?.timezone ?? '',
    sysprepAdminPassword: '',
    sysprepCustomScript: init?.custom_script ?? '',
    startRunningOn: hostIds.length > 0 ? 'specific' : 'any',
    placementHostIds: hostIds,
    // Default migration affinity is 'migratable' when the engine omits it.
    migrationMode: vm.placement_policy?.affinity ?? 'migratable',
    hostPassthroughCpu: vm.cpu?.mode === 'host_passthrough',
    cpuProfileId: vm.cpu_profile?.id ?? '',
    cpuShares: vm.cpu_shares ?? 0,
    // Ballooning defaults on (webadmin default) when the engine omits it.
    memoryBalloonEnabled: vm.memory_policy?.ballooning ?? true,
    ioThreads: vm.io?.threads ?? 0,
    virtioScsiEnabled: vm.virtio_scsi?.enabled ?? false,
    // Random Generator: a present rng_device means "enabled". urandom is the
    // engine default source (RANDOM was retired in 4.1); absent rate fields
    // collapse to 0 = unlimited.
    rngEnabled: vm.rng_device !== undefined,
    rngSource: vm.rng_device?.source ?? 'urandom',
    rngBytes: vm.rng_device?.rate?.bytes ?? 0,
    rngPeriod: vm.rng_device?.rate?.period ?? 0,
    customProperties: customPropertyRows(vm),
    // The VM's current large-icon reference (a bare { id } link on a plain
    // read). No upload staged until the user picks/uploads in the Icon section.
    iconId: vmLargeIconId(vm) ?? '',
    iconUploadData: '',
    iconUploadMediaType: '',
  }
}

// Structural inequality via JSON — the draft's new-section values are plain
// scalars/arrays/records, so a stringify compare is exact and order-stable
// (both sides are built by the same code path).
function changed(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
}

// Build the initialization (cloud-init / sysprep) body from the draft. Empty
// fields are omitted so a PUT never blanks the engine's write-only secrets
// (root_password / authorized_ssh_keys never come back on a GET). Returns
// undefined when Initial Run is disabled. Windows OS types emit the sysprep
// subset; everything else emits cloud-init.
export function buildInitialization(draft: EditVmDraft): Record<string, unknown> | undefined {
  if (!draft.initialRunEnabled) return undefined
  const init: Record<string, unknown> = {}
  if (isWindowsOsType(draft.osType)) {
    if (draft.sysprepDomain) init.domain = draft.sysprepDomain
    if (draft.sysprepTimezone) init.timezone = draft.sysprepTimezone
    if (draft.sysprepAdminPassword) init.root_password = draft.sysprepAdminPassword
    if (draft.sysprepCustomScript) init.custom_script = draft.sysprepCustomScript
    return init
  }
  if (draft.cloudInitHostname) init.host_name = draft.cloudInitHostname
  if (draft.cloudInitUserName) init.user_name = draft.cloudInitUserName
  if (draft.cloudInitPassword) init.root_password = draft.cloudInitPassword
  if (draft.cloudInitSshKeys) init.authorized_ssh_keys = draft.cloudInitSshKeys
  init.regenerate_ssh_keys = draft.cloudInitRegenerateSsh
  if (draft.cloudInitDnsServers) init.dns_servers = draft.cloudInitDnsServers
  if (draft.cloudInitDnsSearch) init.dns_search = draft.cloudInitDnsSearch
  if (draft.cloudInitTimezone) init.timezone = draft.cloudInitTimezone
  if (draft.cloudInitCustomScript) init.custom_script = draft.cloudInitCustomScript
  const nics = draft.cloudInitNics.filter((nic) => nic.name.trim() !== '')
  if (nics.length > 0) {
    init.nic_configurations = {
      nic_configuration: nics.map((nic) => ({
        name: nic.name,
        on_boot: true,
        boot_protocol: 'static',
        ip: {
          address: nic.address,
          netmask: nic.netmask,
          gateway: nic.gateway,
          version: 'v4',
        },
      })),
    }
  }
  return init
}

// Build the rng_device body from the draft. Returns undefined when the device
// is disabled. The optional rate limit is only emitted when a positive value
// is set, and only the set fields ride (0 = unlimited = absent, the engine
// default).
export function buildRngDevice(draft: EditVmDraft): Record<string, unknown> | undefined {
  if (!draft.rngEnabled) return undefined
  const device: Record<string, unknown> = { source: draft.rngSource }
  const rate: Record<string, unknown> = {}
  if (draft.rngBytes > 0) rate.bytes = draft.rngBytes
  if (draft.rngPeriod > 0) rate.period = draft.rngPeriod
  if (Object.keys(rate).length > 0) device.rate = rate
  return device
}

// Build the serial_number body from the draft. host/vm carry only the policy;
// custom pairs it with the user's value; '' (the cluster-default UI choice)
// maps to policy 'none', which the api-model documents as "remove the policy,
// moving it to the default (null)".
export function buildSerialNumber(draft: EditVmDraft): Record<string, unknown> {
  if (draft.serialNumberPolicy === '') return { policy: 'none' }
  if (draft.serialNumberPolicy === 'custom') {
    return { policy: 'custom', value: draft.customSerialNumber }
  }
  return { policy: draft.serialNumberPolicy }
}

// The ISO file id the Boot section's CD picker should insert for the next boot,
// or undefined when the picker was never touched. The attached CD lives in the
// vm cdroms subcollection (PUT /vms/{id}/cdroms/{cdromId}) rather than the vm
// PUT body, so the modal fires this as a separate call on save.
// Guarded by cdTouched so an untouched picker never ejects the current CD, even
// when the Boot tab was opened (which seeds attachedCdId from the current tray).
export function buildCdromChange(draft: EditVmDraft): string | undefined {
  return draft.cdTouched ? draft.attachedCdId : undefined
}

// Did the edit switch the VM into headless mode (graphics device removed)?
// display.type can set spice/vnc on the vm PUT but cannot express "no graphics"
// — that is a graphics_consoles subcollection removal the modal performs
// separately on save. True only on the baseline→headless
// transition, so re-saving an already-headless VM is a no-op.
export function graphicsConsoleRemovalNeeded(draft: EditVmDraft, baseline: EditVmDraft): boolean {
  return baseline.graphicsProtocol !== 'headless' && draft.graphicsProtocol === 'headless'
}

// Append the Initial Run / Host / Resource Allocation sub-objects to the payload
// — but only the ones that actually changed vs the loaded baseline. This is
// webadmin's omit-unchanged discipline: an untouched section is absent from the
// body, so the engine's per-field isSet guards preserve whatever it isn't told
// about (mirrors buildClusterExtrasPayload). Without a baseline these sections
// are skipped entirely, keeping the round-trip contract of the base body intact.
function applyChangedSections(
  payload: Record<string, unknown>,
  draft: EditVmDraft,
  baseline: EditVmDraft,
): void {
  // Initial Run — emit the whole block only when it differs from the loaded one.
  const init = buildInitialization(draft)
  if (init !== undefined && changed(init, buildInitialization(baseline))) {
    payload.initialization = init
  }

  // Host — placement policy. affinity (migration mode) and the pinned host set
  // are independent axes; each is only sent when it moved. "Any host" clears the
  // pinned subset with a present-but-empty list.
  const placement: Record<string, unknown> = {}
  if (draft.migrationMode && draft.migrationMode !== baseline.migrationMode) {
    placement.affinity = draft.migrationMode
  }
  if (
    draft.startRunningOn !== baseline.startRunningOn ||
    changed(draft.placementHostIds, baseline.placementHostIds)
  ) {
    placement.hosts =
      draft.startRunningOn === 'specific'
        ? { host: draft.placementHostIds.map((id) => ({ id })) }
        : { host: [] }
  }
  if (Object.keys(placement).length > 0) payload.placement_policy = placement

  // Host — Pass-Through Host CPU rides on the cpu block the base body already
  // emits, so add mode there rather than sending a second cpu object.
  if (draft.hostPassthroughCpu !== baseline.hostPassthroughCpu) {
    ;(payload.cpu as Record<string, unknown>).mode = draft.hostPassthroughCpu
      ? 'host_passthrough'
      : 'custom'
  }

  // Resource Allocation.
  if (draft.cpuProfileId && draft.cpuProfileId !== baseline.cpuProfileId) {
    payload.cpu_profile = { id: draft.cpuProfileId }
  }
  if (draft.cpuShares !== baseline.cpuShares) payload.cpu_shares = draft.cpuShares
  if (draft.memoryBalloonEnabled !== baseline.memoryBalloonEnabled) {
    ;(payload.memory_policy as Record<string, unknown>).ballooning = draft.memoryBalloonEnabled
  }
  if (draft.ioThreads !== baseline.ioThreads) payload.io = { threads: draft.ioThreads }
  if (draft.virtioScsiEnabled !== baseline.virtioScsiEnabled) {
    payload.virtio_scsi = { enabled: draft.virtioScsiEnabled }
  }

  // Random Generator — enabling or re-tuning sends the device object; DISABLING
  // sends the EMPTY object. The API model documents no removal semantics for
  // rng_device at all; the empty object mirrors the clear-by-empty-tag
  // convention the model documents for `initialization` (4.1.8+). This is
  // UNVERIFIED against a live engine and behavior may vary by version — the
  // RngSection shows an explicit warning telling the user to verify the device
  // actually detached after saving (vm.edit.rng.removalWarning.*).
  const rng = buildRngDevice(draft)
  if (changed(rng, buildRngDevice(baseline))) {
    payload.rng_device = rng ?? {}
  }

  // Console depth — graphics protocol / VNC keyboard / smartcard ride the
  // `display` block the base body already emits (like ballooning rides on
  // memory_policy); soundcard + serial console are their own top-level keys.
  // Each is sent only when it moved from baseline. Graphics: spice/vnc set
  // display.type; headless is "remove the graphics device", which is a
  // graphics_consoles subcollection DELETE the vm PUT can't express — so
  // headless is NOT written here (see graphicsConsoleRemovalNeeded)
  // and the Console section shows a hint.
  const display = payload.display as Record<string, unknown>
  if (
    draft.graphicsProtocol !== baseline.graphicsProtocol &&
    draft.graphicsProtocol !== 'headless'
  ) {
    display.type = draft.graphicsProtocol
  }
  if (draft.vncKeyboardLayout !== baseline.vncKeyboardLayout) {
    // '' clears the stored layout back to the engine default.
    display.keyboard_layout = draft.vncKeyboardLayout
  }
  if (draft.smartcardEnabled !== baseline.smartcardEnabled) {
    display.smartcard_enabled = draft.smartcardEnabled
  }
  if (draft.soundcardEnabled !== baseline.soundcardEnabled) {
    payload.soundcard_enabled = draft.soundcardEnabled
  }
  if (draft.serialConsoleEnabled !== baseline.serialConsoleEnabled) {
    payload.console = { enabled: draft.serialConsoleEnabled }
  }

  // Boot depth — custom direct-kernel boot rides the `os` block the base body
  // already emits. '' clears the stored value back to no custom kernel.
  const os = payload.os as Record<string, unknown>
  if (draft.kernelPath !== baseline.kernelPath) os.kernel = draft.kernelPath
  if (draft.initrdPath !== baseline.initrdPath) os.initrd = draft.initrdPath
  if (draft.kernelParams !== baseline.kernelParams) os.cmdline = draft.kernelParams

  // High Availability depth — VM lease storage domain. Selecting a domain sets
  // the lease target; clearing it sends the empty-object removal convention
  // (mirrors rng_device removal — the empty-tag clear the model documents for
  // `initialization`; UNVERIFIED for `lease` against a live engine).
  if (draft.leaseStorageDomainId !== baseline.leaseStorageDomainId) {
    payload.lease =
      draft.leaseStorageDomainId === ''
        ? {}
        : { storage_domain: { id: draft.leaseStorageDomainId } }
  }

  // System depth — hardware-clock time zone. '' clears it to the engine default.
  if (draft.hardwareClockTimezone !== baseline.hardwareClockTimezone) {
    payload.time_zone = { name: draft.hardwareClockTimezone }
  }

  // System depth — SMBIOS serial-number policy. host/vm set the policy; custom
  // pairs it with the custom value; '' (cluster default) sends policy 'none'
  // (api-model SerialNumberPolicy.NONE — "remove the policy, default null").
  // Sent when the policy or, for custom, its value moved.
  const serialMoved =
    draft.serialNumberPolicy !== baseline.serialNumberPolicy ||
    (draft.serialNumberPolicy === 'custom' &&
      draft.customSerialNumber !== baseline.customSerialNumber)
  if (serialMoved) payload.serial_number = buildSerialNumber(draft)

  // Custom Properties — CLEAR-TO-NONE: a present-but-empty custom_property list
  // clears every property (webadmin semantics), an absent key preserves them,
  // so the block is only sent when the rows actually changed. Unnamed rows
  // (still being typed) are dropped from the wire.
  const properties = normalizedCustomProperties(draft)
  if (changed(properties, normalizedCustomProperties(baseline))) {
    payload.custom_properties = { custom_property: properties }
  }

  // Icon — large_icon. A staged custom upload always wins and sends the inline
  // { media_type, data } (the engine creates a new icon and binds it); picking
  // a different catalog icon sends { id }. Applied immediately (not a next-run
  // key) since the icon is pure metadata. Absent when nothing changed.
  const icon = buildLargeIcon(draft, baseline)
  if (icon !== undefined) payload.large_icon = icon
}

// The large_icon body for save, or undefined when the icon is unchanged. A
// custom upload (base64 data present) takes precedence over a catalog id.
export function buildLargeIcon(
  draft: EditVmDraft,
  baseline: EditVmDraft,
): Record<string, unknown> | undefined {
  if (draft.iconUploadData !== '') {
    return { media_type: draft.iconUploadMediaType, data: draft.iconUploadData }
  }
  if (draft.iconId !== '' && draft.iconId !== baseline.iconId) {
    return { id: draft.iconId }
  }
  return undefined
}

// The wire-shape rows: only named properties count (an unnamed row is UI noise,
// not a directive to the engine).
function normalizedCustomProperties(draft: EditVmDraft): CustomPropertyRow[] {
  return draft.customProperties.filter((row) => row.name.trim() !== '')
}

// Draft → PUT body for updateVm. Memory fields go back to bytes; empty-string
// optional scalars (osType/disconnectAction/clusterId) are omitted rather than
// sent as '' so a partial update never blanks a field the user left untouched.
// A baseline (the draft the modal seeded from) enables the omit-unchanged path
// for the Initial Run / Host / Resource Allocation sections — omit it (tests,
// round-trip) and those sections stay out of the body.
export function draftToPayload(
  draft: EditVmDraft,
  baseline?: EditVmDraft,
): Record<string, unknown> {
  const bootDeviceList = [draft.firstBootDevice, draft.secondBootDevice].filter(Boolean)

  const payload: Record<string, unknown> = {
    name: draft.name,
    description: draft.description,
    comment: draft.comment,
    os: {
      ...(draft.osType ? { type: draft.osType } : {}),
      boot: { devices: { device: bootDeviceList } },
    },
    type: draft.optimizedFor,
    stateless: draft.stateless,
    delete_protected: draft.deleteProtected,
    memory: draft.memoryMb * MiB,
    memory_policy: {
      max: draft.maxMemoryMb * MiB,
      guaranteed: draft.guaranteedMemoryMb * MiB,
    },
    cpu: {
      topology: {
        sockets: draft.sockets,
        cores: draft.coresPerSocket,
        threads: draft.threadsPerCore,
      },
    },
    high_availability: { enabled: draft.haEnabled, priority: draft.haPriority },
    display: {
      monitors: draft.monitors,
      ...(draft.disconnectAction ? { disconnect_action: draft.disconnectAction } : {}),
    },
    usb: { enabled: draft.usbEnabled },
    bios: { boot_menu: { enabled: draft.bootMenuEnabled } },
  }

  if (draft.clusterId) payload.cluster = { id: draft.clusterId }

  if (baseline) applyChangedSections(payload, draft, baseline)

  return payload
}

// The subset of draft fields whose change only takes effect after a reboot
// (webadmin's next-run matrix, kept conservative). When a running VM's edit
// touches any of these the modal offers the Next-Run dialog. Hot-pluggable
// fields — name/description/comment, Memory Size, HA, CPU shares, ballooning,
// placement/migration — are deliberately absent, so editing only those saves
// straight through even on a running VM.
const NEXT_RUN_KEYS: (keyof EditVmDraft)[] = [
  'osType',
  'clusterId',
  'optimizedFor',
  'maxMemoryMb',
  'guaranteedMemoryMb',
  'sockets',
  'coresPerSocket',
  'threadsPerCore',
  'monitors',
  'usbEnabled',
  'disconnectAction',
  // Console depth — every graphics/console device change lands on next start.
  'graphicsProtocol',
  'vncKeyboardLayout',
  'smartcardEnabled',
  'soundcardEnabled',
  'serialConsoleEnabled',
  'firstBootDevice',
  'secondBootDevice',
  'bootMenuEnabled',
  // Boot depth — a custom kernel/initrd/cmdline only applies on the next boot.
  'kernelPath',
  'initrdPath',
  'kernelParams',
  // HA depth — a VM lease change is applied on next run for a running VM.
  'leaseStorageDomainId',
  // System depth — clock time zone + SMBIOS serial number are boot-time values.
  'hardwareClockTimezone',
  'serialNumberPolicy',
  'customSerialNumber',
  'hostPassthroughCpu',
  'virtioScsiEnabled',
  'ioThreads',
  'cpuProfileId',
  'initialRunEnabled',
  'cloudInitHostname',
  'cloudInitUserName',
  'cloudInitPassword',
  'cloudInitSshKeys',
  'cloudInitRegenerateSsh',
  'cloudInitDnsServers',
  'cloudInitDnsSearch',
  'cloudInitTimezone',
  'cloudInitCustomScript',
  'sysprepDomain',
  'sysprepTimezone',
  'sysprepAdminPassword',
  'sysprepCustomScript',
  'rngEnabled',
  'rngSource',
  'rngBytes',
  'rngPeriod',
]

// Does the pending edit contain any reboot-required change vs the loaded
// baseline? Drives whether the modal shows the Next-Run dialog on a running VM.
// The two array-valued fields (cloud-init NICs, custom properties) compare
// structurally.
export function editRequiresRestart(draft: EditVmDraft, baseline: EditVmDraft): boolean {
  return (
    NEXT_RUN_KEYS.some((key) => draft[key] !== baseline[key]) ||
    changed(draft.cloudInitNics, baseline.cloudInitNics) ||
    changed(normalizedCustomProperties(draft), normalizedCustomProperties(baseline))
  )
}

// The VM is "not powered off" — the Next-Run dialog only matters then, since a
// down VM applies every change on its next start regardless.
export function vmIsRunning(status: string | undefined): boolean {
  const kind = statusKind(status)
  return kind === 'running' || kind === 'paused' || kind === 'transitional'
}

// Migration mode → placement_policy.affinity. Webadmin's three choices; labels
// resolve per-locale at the render site (HostSection) via the labelId.
export const MIGRATION_MODE_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'migratable', labelId: 'vm.edit.host.migrationMode.migratable' },
  { value: 'user_migratable', labelId: 'vm.edit.host.migrationMode.userMigratable' },
  { value: 'pinned', labelId: 'vm.edit.host.migrationMode.pinned' },
]

// RNG entropy sources — webadmin's two live options (the deprecated RANDOM
// source was retired in 4.1; urandom is the default). Labels resolve per-locale
// at the render site (RngSection) via the labelId.
export const RNG_SOURCE_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'urandom', labelId: 'vm.edit.rng.source.urandom' },
  { value: 'hwrng', labelId: 'vm.edit.rng.source.hwrng' },
]

// CPU shares presets (webadmin buckets); anything else is "Custom" and edited as
// a raw integer. CPU_SHARES_CUSTOM marks the Custom select option (never sent).
export const CPU_SHARES_CUSTOM = -1
export const CPU_SHARES_PRESETS: { value: number; labelId: MessageId }[] = [
  { value: 0, labelId: 'vm.edit.resources.cpuShares.disabled' },
  { value: 512, labelId: 'vm.edit.resources.cpuShares.low' },
  { value: 1024, labelId: 'vm.edit.resources.cpuShares.medium' },
  { value: 2048, labelId: 'vm.edit.resources.cpuShares.high' },
]

// Is a stored CPU-shares value one of the presets (so the select shows it) or a
// custom integer (so the Custom option + number input take over)?
export function isCpuSharesPreset(shares: number): boolean {
  return CPU_SHARES_PRESETS.some((preset) => preset.value === shares)
}

// ── Memory GiB display layer + reactive derivation ────────────────────────────
// The draft stays in integer MiB (the engine granularity); the System section
// only VIEWS/EDITS it in GiB. These are pure conversions so the component file
// stays component-only (no Fast-refresh export warnings) and the math is unit-
// tested here.

// MiB → GiB display string. Renders an integer when exact (4096 → "4") and up to
// three decimals otherwise (1536 → "1.5", 3333 → "3.255"), stripping trailing
// zeros so the field never shows float noise. Three decimals resolves to ~1 MiB
// granularity around the 1 GiB range.
export function mibToGib(mib: number): string {
  if (!Number.isFinite(mib)) return '0'
  return String(Number((mib / MIB_PER_GIB).toFixed(3)))
}

// GiB edit string → integer MiB. Empty collapses to 0 (keeps the input
// controlled, mirroring the old setNumber convention) and a non-numeric string
// is treated as 0; otherwise round to the nearest MiB — the draft/engine quantum
// — so 1.5 GiB → 1536 MiB exactly and 1.1 GiB → 1126 MiB.
export function gibToMib(value: string): number {
  if (value === '') return 0
  const gib = Number(value)
  if (!Number.isFinite(gib)) return 0
  return Math.round(gib * MIB_PER_GIB)
}

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
export function deriveMemoryOnCommit(draft: EditVmDraft, overcommitPercent?: number): EditVmDraft {
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
export function vmMemoryError(draft: EditVmDraft): MessageId | undefined {
  if (draft.memoryMb <= 0) return 'templateForm.memory.error.positive'
  if (draft.guaranteedMemoryMb > draft.memoryMb) {
    return 'templateForm.memory.error.guaranteed'
  }
  if (draft.maxMemoryMb > 0 && draft.maxMemoryMb < draft.memoryMb) {
    return 'templateForm.memory.error.max'
  }
  return undefined
}

// Webadmin's VM-name validation (UnitVmModel/CloneVmModel.validate):
// NotEmptyValidation + LengthValidation(64, getMaxVmNameLength) +
// I18NNameValidation — unicode letters, digits, '-', '_' and '.', no spaces.
// Shared by the Edit VM General section and the Clone VM dialog so both mark
// the field invalid inline instead of bouncing a raw engine fault.
//
// i18n: this deliberately returns an English string, NOT a MessageId. Several
// consumers outside this feature dir render the return value directly as text
// (CloneVmModal, TemplateFormModal, instanceTypeDraft's re-export), so returning
// an id here would surface a raw id to those users. Left English for backward
// compatibility until those call sites move to a MessageId contract in one pass.
export const MAX_VM_NAME_LENGTH = 64
const VM_NAME_PATTERN = /^[\p{L}\p{Nd}_.-]+$/u

export function vmNameError(name: string): string | undefined {
  if (name.trim() === '') return 'Name is required'
  if (name.length > MAX_VM_NAME_LENGTH) {
    return `Name must be ${MAX_VM_NAME_LENGTH} characters or fewer`
  }
  if (!VM_NAME_PATTERN.test(name)) {
    return "Name may contain only letters, digits, '-', '_' and '.' — no spaces"
  }
  return undefined
}

// "Optimized for" (vm.type) — webadmin's three profiles. Shared so the General
// section's select and any label lookup stay in sync. Each option carries both
// a plain `label` (kept for out-of-dir consumers like TemplateFormModal that
// render it directly) and a `labelId` the Edit VM sections resolve via t().
export const OPTIMIZED_FOR_OPTIONS: { value: string; label: string; labelId: MessageId }[] = [
  { value: 'desktop', label: 'Desktop', labelId: 'vm.edit.optimizedFor.desktop' },
  { value: 'server', label: 'Server', labelId: 'vm.edit.optimizedFor.server' },
  {
    value: 'high_performance',
    label: 'High Performance',
    labelId: 'vm.edit.optimizedFor.highPerformance',
  },
]

// Boot device select options — a blank placeholder plus the three orderable
// devices the Boot Options section offers for first/second boot. Labels resolve
// per-locale at the render site (BootOptionsSection) via the labelId.
export const BOOT_DEVICE_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: '', labelId: 'vm.edit.boot.device.none' },
  { value: 'hd', labelId: 'vm.edit.boot.device.hd' },
  { value: 'cdrom', labelId: 'vm.edit.boot.device.cdrom' },
  { value: 'network', labelId: 'vm.edit.boot.device.network' },
]

// Console "disconnect action" options — a blank placeholder plus the engine's
// four console-disconnect behaviors. Labels resolve per-locale at the render
// site (ConsoleSection) via the labelId.
export const DISCONNECT_ACTION_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: '', labelId: 'vm.edit.console.disconnect.none' },
  { value: 'LOCK_SCREEN', labelId: 'vm.edit.console.disconnect.lock' },
  { value: 'LOGOUT', labelId: 'vm.edit.console.disconnect.logout' },
  { value: 'REBOOT', labelId: 'action.reboot' },
  { value: 'SHUTDOWN', labelId: 'vm.edit.console.disconnect.shutdown' },
]

// Graphics protocol options — SPICE/VNC map to display.type; Headless removes
// the graphics device (webadmin's IsHeadlessModeEnabled). SPICE/VNC are product
// tokens kept verbatim (a plain `label`); only "Headless mode" is translatable,
// so it carries a `labelId` the Console section resolves via t().
export const GRAPHICS_PROTOCOL_OPTIONS: {
  value: string
  label?: string
  labelId?: MessageId
}[] = [
  { value: 'spice', label: 'SPICE' },
  { value: 'vnc', label: 'VNC' },
  { value: 'headless', labelId: 'vm.edit.console.headless' },
]

// VNC keyboard-layout codes the Console section offers (the QEMU/libvirt keymap
// set webadmin's VncKeyMapType exposes). '' (engine default) is prepended by the
// section, and a loaded value outside this list is folded in there so the select
// stays controlled.
export const VNC_KEYBOARD_LAYOUTS: string[] = [
  'ar',
  'de',
  'de-ch',
  'en-gb',
  'en-us',
  'es',
  'fi',
  'fr',
  'fr-be',
  'fr-ca',
  'fr-ch',
  'hr',
  'hu',
  'is',
  'it',
  'ja',
  'lt',
  'lv',
  'mk',
  'nl',
  'no',
  'pl',
  'pt',
  'pt-br',
  'ru',
  'sl',
  'sv',
  'th',
  'tr',
]

// Curated hardware-clock time zones (time_zone.name). A representative set is
// enough — webadmin loads the full engine list asynchronously; the System
// section prepends the engine-default ('') option and folds in any loaded value
// not present here so the select stays controlled.
export const HARDWARE_CLOCK_TIMEZONES: string[] = [
  'Etc/GMT',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Moscow',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
]

// Serial-number policy options — '' (cluster default → policy 'none' on the
// wire) plus the three api-model SerialNumberPolicy values the System section
// offers. Custom reveals the free-text serial input. Labels resolve per-locale
// at the render site (SystemSection) via the labelId.
export const SERIAL_NUMBER_POLICY_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: '', labelId: 'vm.edit.system.serialPolicy.default' },
  { value: 'host', labelId: 'vm.edit.system.serialPolicy.host' },
  { value: 'vm', labelId: 'vm.edit.system.serialPolicy.vm' },
  { value: 'custom', labelId: 'vm.edit.system.serialPolicy.custom' },
]
