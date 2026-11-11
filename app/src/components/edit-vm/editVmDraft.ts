import { vmLargeIconId } from '../../api/resources/icons'
import { watchdogChangeFor, type WatchdogChange } from '../../api/resources/watchdogs'
import type { Vm } from '../../api/schemas/vm'
import type { Watchdog } from '../../api/schemas/watchdog'
import type { MessageId } from '../../i18n/messages/en'
import { statusKind } from '../../lib/vm-status'
import { cpuTuneBody, effectiveCpuPinning, formatCpuPinning } from './cpuPinning'
import type { NumaNodeDraft } from './numaDraft'
import {
  applyVmBaseChanges,
  changed,
  normalizedCustomProperties,
  vmBaseToDraft,
  type VmBaseDraft,
  type WatchdogFields,
} from './vmBaseDraft'

// The VmBase helpers moved to vmBaseDraft.ts (the shared-section contract);
// re-exported so existing imports keep working.
export {
  buildLargeIcon,
  buildSerialNumber,
  deriveMemoryOnCommit,
  guaranteedForMemory,
  vmMemoryError,
  type CustomPropertyRow,
} from './vmBaseDraft'

// Memory is stored in bytes on the wire (see schemas/vm.ts) but edited in MiB
// in the modal — convert at the draft boundary so every section works in MiB.
const MiB = 1024 * 1024

// The System section EDITS memory in GiB (webadmin/admin convention) while the
// draft keeps the authoritative integer MiB. oVirt "GiB" is 1024 MiB regardless
// of the field label wording, so the display divisor is fixed at 1024.
const MIB_PER_GIB = 1024

// The shared, flat draft the Edit Virtual Machine modal owns and each section
// component reads/writes. Every field is always defined (never undefined) so
// controlled inputs never flip between controlled/uncontrolled — optional wire
// values collapse to '' / 0 / false / a sensible default here. The VmBase
// fields the reusable sections edit (System, Console, High Availability,
// Resource Allocation, Custom Properties, Icon) come from VmBaseDraft; the
// watchdog device from WatchdogFields (see vmBaseDraft.ts). Only VM-specific
// fields are declared here.
export interface EditVmDraft extends VmBaseDraft, WatchdogFields {
  // General
  name: string
  description: string
  comment: string
  clusterId: string
  osType: string
  optimizedFor: string // 'desktop' | 'server' | 'high_performance'
  stateless: boolean
  deleteProtected: boolean
  // General depth — chipset/firmware (bios.type; 'cluster_default' follows the
  // cluster) and webadmin's Start-in-Pause-Mode toggle.
  biosType: string
  startPaused: boolean
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
  // Host depth — per-VM migration tuning. Policy '' = cluster default; the
  // InheritableBoolean trio rides as its string enum ('inherit'|'true'|'false');
  // downtime is ms with an enable toggle (disabled = engine default).
  vmMigrationPolicyId: string
  migrationDowntimeEnabled: boolean
  migrationDowntime: number
  migrationAutoConverge: string
  migrationCompressed: string
  migrationEncrypted: string
  parallelMigrationsPolicy: string
  customParallelMigrations: number
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
  // Host depth: CPU pinning. The 4.5 policy (api-model CpuPinningPolicy) and,
  // for Manual, the pinning string in webadmin's format ("0#0_1#1-3"), which
  // maps 1:1 to cpu.cpu_tune.vcpu_pins (see cpuPinning.ts). '' under every
  // other policy.
  cpuPinningPolicy: string
  cpuPinning: string
  // Host depth: virtual NUMA nodes. They live in the /vms/{id}/numanodes
  // subcollection, not on the vm read, so vmToDraft seeds "not loaded" and the
  // modal folds the nodes into BOTH draft and baseline once the read lands
  // (numaDraftFields), exactly like the watchdog. numaLoaded gates the controls
  // and the save-time plan so an unread topology is never touched.
  numaLoaded: boolean
  numaNodes: NumaNodeDraft[]
  // Random Generator — virtio-rng device (enable + entropy source + optional
  // rate limit; 0 on either rate field means "unlimited / not set")
  rngEnabled: boolean
  rngSource: string
  rngBytes: number
  rngPeriod: number
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

// Loaded placement host ids (the pinned subset). The engine returns bare
// { id, href } links; names are resolved client-side in the Host section.
function placementHostIds(vm: Vm): string[] {
  const hosts = vm.placement_policy?.hosts?.host
  if (!Array.isArray(hosts)) return []
  return hosts.map((host) => host.id ?? '').filter(Boolean)
}

// The loaded manual pinning as webadmin's string (the engine's own stored form).
function loadedCpuPinning(vm: Vm): string {
  const pins = vm.cpu?.cpu_tune?.vcpu_pins?.vcpu_pin ?? []
  return formatCpuPinning(
    pins.flatMap((pin) =>
      pin.vcpu !== undefined && pin.cpu_set !== undefined
        ? [{ vcpu: pin.vcpu, cpuSet: pin.cpu_set }]
        : [],
    ),
  )
}

// Vm read model → fully-populated draft. Every optional wire field is given a
// concrete fallback so the returned draft has no undefined members.
export function vmToDraft(vm: Vm): EditVmDraft {
  const devices = bootDevices(vm)
  const init = vm.initialization
  const hostIds = placementHostIds(vm)
  const cpuPinning = loadedCpuPinning(vm)
  // An engine that predates cpu_pinning_policy (4.4) derives it the same way:
  // a pinning string means Manual, none means None.
  const cpuPinningPolicy = vm.cpu_pinning_policy ?? (cpuPinning !== '' ? 'manual' : 'none')
  return {
    // The VmBase slice the shared sections edit (vmBaseDraft.ts). The VM's
    // large-icon reference is a bare { id } link on a plain read.
    ...vmBaseToDraft(vm, vmLargeIconId(vm) ?? ''),
    name: vm.name ?? '',
    description: vm.description ?? '',
    comment: vm.comment ?? '',
    clusterId: vm.cluster?.id ?? '',
    osType: vm.os?.type ?? '',
    optimizedFor: vm.type ?? 'server',
    stateless: vm.stateless ?? false,
    deleteProtected: vm.delete_protected ?? false,
    biosType: vm.bios?.type ?? 'cluster_default',
    startPaused: vm.start_paused ?? false,
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
    vmMigrationPolicyId: vm.migration?.policy?.id ?? '',
    // A positive stored downtime is an explicit override; absent/non-positive
    // means the engine default applies.
    migrationDowntimeEnabled: (vm.migration_downtime ?? 0) > 0,
    migrationDowntime: vm.migration_downtime !== undefined ? Math.max(vm.migration_downtime, 0) : 0,
    migrationAutoConverge: vm.migration?.auto_converge ?? 'inherit',
    migrationCompressed: vm.migration?.compressed ?? 'inherit',
    migrationEncrypted: vm.migration?.encrypted ?? 'inherit',
    parallelMigrationsPolicy: vm.migration?.parallel_migrations_policy ?? 'inherit',
    customParallelMigrations: vm.migration?.custom_parallel_migrations ?? 0,
    // Seeded from the watchdogs subcollection later (watchdogDraftFields).
    watchdogLoaded: false,
    watchdogId: '',
    watchdogModel: '',
    watchdogAction: DEFAULT_WATCHDOG_ACTION,
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
    cpuPinningPolicy,
    // Webadmin only shows the string under Manual
    // (CpuPinningVmBaseToUnitBuilder).
    cpuPinning: cpuPinningPolicy === 'manual' ? cpuPinning : '',
    // Seeded from the numanodes subcollection later (numaDraftFields).
    numaLoaded: false,
    numaNodes: [],
    // Random Generator: a present rng_device means "enabled". urandom is the
    // engine default source (RANDOM was retired in 4.1); absent rate fields
    // collapse to 0 = unlimited.
    rngEnabled: vm.rng_device !== undefined,
    rngSource: vm.rng_device?.source ?? 'urandom',
    rngBytes: vm.rng_device?.rate?.bytes ?? 0,
    rngPeriod: vm.rng_device?.rate?.period ?? 0,
  }
}

// The engine's default watchdog action (webadmin preselects it too):
// api-model WatchdogAction.NONE only logs the event.
export const DEFAULT_WATCHDOG_ACTION = 'none'

// The draft fields for the loaded watchdog collection. A VM holds at most one
// watchdog; an empty list maps to "No watchdog" with the default action.
export function watchdogDraftFields(
  watchdogs: Watchdog[],
): Pick<EditVmDraft, 'watchdogLoaded' | 'watchdogId' | 'watchdogModel' | 'watchdogAction'> {
  const device = watchdogs[0]
  return {
    watchdogLoaded: true,
    watchdogId: device?.id ?? '',
    watchdogModel: device?.model ?? '',
    watchdogAction: device?.action ?? DEFAULT_WATCHDOG_ACTION,
  }
}

// The watchdog device operation a save must perform, or undefined when nothing
// moved (or the device was never read, so its state is unknown). Picking "No
// watchdog" removes the loaded device; picking a model on a VM without one adds
// it; a model/action change on an existing device updates it in place.
export function buildWatchdogChange(
  draft: EditVmDraft,
  baseline: EditVmDraft,
): WatchdogChange | undefined {
  if (!baseline.watchdogLoaded || !draft.watchdogLoaded) return undefined
  const current =
    baseline.watchdogId !== ''
      ? {
          id: baseline.watchdogId,
          model: baseline.watchdogModel,
          action: baseline.watchdogAction,
        }
      : undefined
  return watchdogChangeFor(current, { model: draft.watchdogModel, action: draft.watchdogAction })
}

// Keys vmFieldsChanged ignores: the watchdog, the vNUMA nodes and the CD, which
// each ride their own subcollection (the CD tray id is also seeded into the
// draft alone on open; a real CD pick is cdTouched + attachedCdId, see
// buildCdromChange).
const NON_VM_DRAFT_KEYS: ReadonlySet<keyof EditVmDraft> = new Set([
  'watchdogLoaded',
  'watchdogId',
  'watchdogModel',
  'watchdogAction',
  'numaLoaded',
  'numaNodes',
  'attachedCdId',
  'cdTouched',
])

// Did anything on the vm PUT body move? When not, a save that only carries a
// watchdog and/or CD change skips the vm PUT (nothing to send), which is also
// what keeps a retry after a partial failure to the step that failed.
export function vmFieldsChanged(draft: EditVmDraft, baseline: EditVmDraft): boolean {
  return (Object.keys(draft) as (keyof EditVmDraft)[]).some(
    (key) => !NON_VM_DRAFT_KEYS.has(key) && changed(draft[key], baseline[key]),
  )
}

// The baseline once the watchdog step landed: its fields describe the device
// the engine now holds (watchdogDraftFields of the applied result).
export function baselineWithWatchdog(
  baseline: EditVmDraft,
  device: Watchdog | undefined,
): EditVmDraft {
  return { ...baseline, ...watchdogDraftFields(device ? [device] : []) }
}

// The baseline once the vm PUT landed: every vm field the draft carries is
// saved. The watchdog, vNUMA nodes and CD keep the baseline's own state (each is
// settled by its own step), and a pending icon upload is spent (the caller clears it from
// the draft too) so it is not re-sent.
export function baselineAfterVmSave(draft: EditVmDraft, baseline: EditVmDraft): EditVmDraft {
  return {
    ...draft,
    iconUploadData: '',
    iconUploadMediaType: '',
    watchdogLoaded: baseline.watchdogLoaded,
    watchdogId: baseline.watchdogId,
    watchdogModel: baseline.watchdogModel,
    watchdogAction: baseline.watchdogAction,
    numaLoaded: baseline.numaLoaded,
    numaNodes: baseline.numaNodes,
    attachedCdId: baseline.attachedCdId,
    cdTouched: baseline.cdTouched,
  }
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

  // Host depth: CPU pinning. The policy is its own top-level key; the manual
  // string rides the cpu block as cpu_tune (see cpuPinning.ts). Leaving Manual
  // must also CLEAR the stored string: the engine rejects a string under any
  // other policy, and its REST layer flips a None policy that still has a
  // string back to Manual (BackendVmsResource.updateCpuPinningFields). So a
  // policy change to anything but Manual always sends the clearing cpu_tune.
  const policyMoved = draft.cpuPinningPolicy !== baseline.cpuPinningPolicy
  if (policyMoved) payload.cpu_pinning_policy = draft.cpuPinningPolicy
  const pinning = effectiveCpuPinning(draft)
  if (
    pinning !== effectiveCpuPinning(baseline) ||
    (policyMoved && draft.cpuPinningPolicy !== 'manual')
  ) {
    ;(payload.cpu as Record<string, unknown>).cpu_tune = cpuTuneBody(pinning)
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

  // Boot depth — custom direct-kernel boot rides the `os` block the base body
  // already emits. '' clears the stored value back to no custom kernel.
  const os = payload.os as Record<string, unknown>
  if (draft.kernelPath !== baseline.kernelPath) os.kernel = draft.kernelPath
  if (draft.initrdPath !== baseline.initrdPath) os.initrd = draft.initrdPath
  if (draft.kernelParams !== baseline.kernelParams) os.cmdline = draft.kernelParams

  // General depth — chipset/firmware rides the `bios` block the base body
  // already emits (beside boot_menu). 'cluster_default' is a real BiosType
  // value on a VM, so switching back to the cluster's default is expressible.
  if (draft.biosType !== baseline.biosType) {
    ;(payload.bios as Record<string, unknown>).type = draft.biosType
  }
  if (draft.startPaused !== baseline.startPaused) payload.start_paused = draft.startPaused

  // Host depth — per-VM migration tuning. Only the touched keys ride inside a
  // single migration object; an untouched section sends nothing. Clearing the
  // per-VM policy back to "cluster default" sends policy: {} (the empty-object
  // removal convention lease/rng use — UNVERIFIED against a live engine, same
  // caveat as those).
  const migration: Record<string, unknown> = {}
  if (draft.vmMigrationPolicyId !== baseline.vmMigrationPolicyId) {
    migration.policy = draft.vmMigrationPolicyId === '' ? {} : { id: draft.vmMigrationPolicyId }
  }
  if (draft.migrationAutoConverge !== baseline.migrationAutoConverge) {
    migration.auto_converge = draft.migrationAutoConverge
  }
  if (draft.migrationCompressed !== baseline.migrationCompressed) {
    migration.compressed = draft.migrationCompressed
  }
  if (draft.migrationEncrypted !== baseline.migrationEncrypted) {
    migration.encrypted = draft.migrationEncrypted
  }
  if (
    draft.parallelMigrationsPolicy !== baseline.parallelMigrationsPolicy ||
    (draft.parallelMigrationsPolicy === 'custom' &&
      draft.customParallelMigrations !== baseline.customParallelMigrations)
  ) {
    migration.parallel_migrations_policy = draft.parallelMigrationsPolicy
    if (draft.parallelMigrationsPolicy === 'custom' && draft.customParallelMigrations > 0) {
      migration.custom_parallel_migrations = draft.customParallelMigrations
    }
  }
  if (Object.keys(migration).length > 0) payload.migration = migration

  // Host depth — custom migration downtime (ms). Disabling the override sends
  // -1, the engine's stored sentinel for "use the engine default"
  // (DefaultMaximumMigrationDowntime); webadmin sends null, which a JSON body
  // cannot express. UNVERIFIED against a live engine, same caveat as lease/rng.
  if (
    draft.migrationDowntimeEnabled !== baseline.migrationDowntimeEnabled ||
    (draft.migrationDowntimeEnabled && draft.migrationDowntime !== baseline.migrationDowntime)
  ) {
    payload.migration_downtime = draft.migrationDowntimeEnabled ? draft.migrationDowntime : -1
  }

  // The VmBase depth fields the shared sections edit (Resource Allocation,
  // Console, System and High Availability depth, Custom Properties, Icon):
  // vmBaseDraft.applyVmBaseChanges, same omit-unchanged rule.
  applyVmBaseChanges(payload, draft, baseline)
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
  // General/System depth — chipset, pause-on-start and the machine/CPU-model
  // overrides all bind at boot.
  'biosType',
  'startPaused',
  'customEmulatedMachine',
  'customCpuModel',
  // Console depth — SSO + the SPICE channel toggles are device config.
  'ssoEnabled',
  'spiceFileTransfer',
  'spiceCopyPaste',
  // Host/HA depth — migration tuning + resume behavior; conservative next-run
  // (the engine hot-applies some of these, but offering the dialog is safe).
  'vmMigrationPolicyId',
  'migrationDowntimeEnabled',
  'migrationDowntime',
  'migrationAutoConverge',
  'migrationCompressed',
  'migrationEncrypted',
  'parallelMigrationsPolicy',
  'customParallelMigrations',
  'storageErrorResumeBehaviour',
  // HA depth: the watchdog is a device; its add/update/remove commands only
  // write the vm_device table and the engine marks the device editable on
  // status Down only (VmManagementParametersBase @EditableDeviceOnVmStatusField),
  // so a running VM picks the change up on its next start.
  'watchdogModel',
  'watchdogAction',
  // Resource Allocation depth — queue counts bind to devices at boot.
  'multiQueuesEnabled',
  'virtioScsiMultiQueuesEnabled',
  'virtioScsiMultiQueues',
  'hostPassthroughCpu',
  // Host depth: the engine marks both CPU pinning fields editable on status
  // Down only (VmBase @EditableVmField(onStatuses = VMStatus.Down)).
  'cpuPinningPolicy',
  'cpuPinning',
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

// Chipset/firmware choices for a VM (api-model types/BiosType) — unlike the
// cluster form, cluster_default is offered and is the usual value. Labels
// resolve per-locale at the render site (GeneralSection) via the labelId.
export const VM_BIOS_TYPE_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'cluster_default', labelId: 'vm.edit.general.bios.clusterDefault' },
  { value: 'i440fx_sea_bios', labelId: 'clusterForm.bios.i440fx' },
  { value: 'q35_sea_bios', labelId: 'clusterForm.bios.q35SeaBios' },
  { value: 'q35_ovmf', labelId: 'clusterForm.bios.q35Ovmf' },
  { value: 'q35_secure_boot', labelId: 'clusterForm.bios.q35SecureBoot' },
]

// Resume behavior after a storage-error pause (api-model
// types/VmStorageErrorResumeBehaviour). auto_resume is the engine default.
export const STORAGE_ERROR_RESUME_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'auto_resume', labelId: 'vm.edit.ha.resume.autoResume' },
  { value: 'leave_paused', labelId: 'vm.edit.ha.resume.leavePaused' },
  { value: 'kill', labelId: 'vm.edit.ha.resume.kill' },
]

// api-model types/InheritableBoolean for the per-VM migration toggles —
// 'inherit' follows the cluster's setting.
export const INHERITABLE_BOOLEAN_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'inherit', labelId: 'vm.edit.host.inherit' },
  { value: 'true', labelId: 'vm.edit.host.inheritable.on' },
  { value: 'false', labelId: 'vm.edit.host.inheritable.off' },
]

// api-model types/ParallelMigrationsPolicy (4.7+) at the VM level — 'inherit'
// follows the cluster; 'custom' reveals the connection-count input (2..255).
export const VM_PARALLEL_MIGRATION_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'inherit', labelId: 'vm.edit.host.inherit' },
  { value: 'disabled', labelId: 'vm.edit.host.parallel.disabled' },
  { value: 'auto', labelId: 'vm.edit.host.parallel.auto' },
  { value: 'auto_parallel', labelId: 'vm.edit.host.parallel.autoParallel' },
  { value: 'custom', labelId: 'vm.edit.host.parallel.custom' },
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

// Watchdog models (api-model types/WatchdogModel). i6300esb is the PCI model
// for x86_64 and ppc64 guests; diag288 is the s390x facility (4.2+). The
// option list narrows by CPU architecture (watchdogModelOptions); model names
// are technical tokens rendered verbatim, only "No watchdog" is translatable.
export const WATCHDOG_MODELS: { value: string; architectures: string[] }[] = [
  { value: 'i6300esb', architectures: ['x86_64', 'ppc64'] },
  { value: 'diag288', architectures: ['s390x'] },
]

// The model values to offer for an architecture: the matching models, all of
// them when the architecture is unknown, plus the loaded value when it falls
// outside the list so the select stays controlled and an edit never silently
// rewrites it.
export function watchdogModelOptions(architecture: string | undefined, current: string): string[] {
  const arch = (architecture ?? '').toLowerCase()
  const matching = WATCHDOG_MODELS.filter(
    (model) => arch === '' || model.architectures.includes(arch),
  ).map((model) => model.value)
  const models = matching.length > 0 ? matching : WATCHDOG_MODELS.map((model) => model.value)
  return current !== '' && !models.includes(current) ? [current, ...models] : models
}

// Watchdog actions (api-model types/WatchdogAction), in webadmin's order.
// Labels resolve at render (t(option.labelId)); the field copy itself (label,
// help, "No watchdog") is the vm.edit.ha.watchdog* / fieldHelp.vm.watchdog*
// ids, shared by the Edit VM HA tab and the New VM wizard.
export const WATCHDOG_ACTION_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'none', labelId: 'vm.edit.ha.watchdogAction.none' },
  { value: 'reset', labelId: 'vm.edit.ha.watchdogAction.reset' },
  { value: 'poweroff', labelId: 'vm.edit.ha.watchdogAction.poweroff' },
  { value: 'pause', labelId: 'vm.edit.ha.watchdogAction.pause' },
  { value: 'dump', labelId: 'vm.edit.ha.watchdogAction.dump' },
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
