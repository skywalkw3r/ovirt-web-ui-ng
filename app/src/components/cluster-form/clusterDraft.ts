// The cluster-form draft type + its read-model seeding and write-body builders,
// kept out of ClusterFormModal.tsx so that (a) the component file only exports a
// component — Fast Refresh stays happy — and (b) the payload wiring is unit-
// testable without a browser (mirrors buildClusterExtrasPayload living in the
// resource layer). The component owns the draft state; everything here is pure.
import type { Cluster } from '../../api/schemas/cluster'
import {
  buildClusterExtrasPayload,
  type ClusterExtrasDraft,
  type MigrationBandwidthMethod,
} from '../../api/resources/clusters'

// The curated CPU models the create select offers — the current webadmin
// defaults for x86 engines. '' (Auto detect) lets the engine pick from the
// first host. An edit-mode cluster whose type predates this list gets its
// current value appended so the select never silently rewrites it.
export const CPU_TYPES = [
  'Intel Cascadelake Server Family',
  'Secure Intel Cascadelake Server Family',
  'Intel Icelake Server Family',
  'Secure Intel Icelake Server Family',
  'AMD EPYC',
  'Secure AMD EPYC',
]

// Compatibility versions the engine accepts for new clusters, newest first.
export const COMPAT_VERSIONS = ['4.8', '4.7']

// Memory over-commit presets — the same three webadmin offers.
export const OVER_COMMIT_OPTIONS = [
  { value: '100', label: 'None' },
  { value: '150', label: 'Server load (150%)' },
  { value: '200', label: 'Desktop load (200%)' },
]

// Cluster Switch Type — webadmin defaults new clusters to legacy (VmNetworkOnly).
export const SWITCH_TYPES = [
  { value: 'legacy', label: 'Legacy' },
  { value: 'ovs', label: 'OVS (Open vSwitch)' },
]

// Firewall implementation — webadmin defaults new clusters to firewalld.
export const FIREWALL_TYPES = [
  { value: 'firewalld', label: 'firewalld' },
  { value: 'iptables', label: 'iptables' },
  { value: 'nftables', label: 'nftables' },
]

// Migration bandwidth assignment method — mirrors the webadmin radio. 'custom'
// reveals the Mbps input.
export const BANDWIDTH_METHODS: { value: MigrationBandwidthMethod; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'hypervisor_default', label: 'Hypervisor default' },
  { value: 'custom', label: 'Custom' },
]

// Host-connectivity fence-skip threshold percentages webadmin offers.
export const CONN_BROKEN_THRESHOLDS = [25, 50, 75, 100]

// CPU architectures (api-model types/Architecture) webadmin's Edit Cluster
// offers; 'undefined' = auto-detect from the CPU type / first host. The values
// are technical tokens rendered verbatim (except undefined → "Auto detect").
export const CPU_ARCHITECTURES = ['undefined', 'x86_64', 'ppc64', 's390x', 'aarch64']

// Cluster default chipset/firmware (api-model types/BiosType, minus
// cluster_default which is VM-only). '' = leave unset so the engine derives it
// from the architecture. Webadmin's "Change existing VMs/Templates from I440FX
// to Q35" companion checkbox is a webadmin-internal mass-update command with NO
// REST field — deliberately not offered (documented divergence).
export const BIOS_TYPES = ['i440fx_sea_bios', 'q35_sea_bios', 'q35_ovmf', 'q35_secure_boot']

// FIPS 140-2 mode (api-model types/FipsMode). 'undefined' = auto-detect from
// the first host that joins, mirroring webadmin's Auto Detect option.
export const FIPS_MODES = ['undefined', 'disabled', 'enabled']

// Unit of the host-memory audit-log threshold (api-model
// types/LogMaxMemoryUsedThresholdType).
export const LOG_THRESHOLD_TYPES = ['percentage', 'absolute_value_in_mb']

// Resilience policy (api-model types/MigrateOnError) — what happens to the
// cluster's VMs when their host fails.
export const RESILIENCE_POLICIES = ['migrate', 'migrate_highly_available', 'do_not_migrate']

// api-model types/InheritableBoolean — a string enum, NOT a JSON boolean. Used
// by the migration encryption select ('inherit' = follow the engine default).
export const INHERITABLE_BOOLEAN = ['inherit', 'true', 'false']

// api-model types/ParallelMigrationsPolicy (4.7+). 'custom' reveals the
// connection-count input (engine bounds: 2..255).
export const PARALLEL_MIGRATION_POLICIES = [
  'inherit',
  'disabled',
  'auto',
  'auto_parallel',
  'custom',
]

// The flat, always-defined draft the modal owns. Selects ride as strings
// (FormSelect values are strings) and are coerced on the way out. The base
// fields feed draftToPayload; the deepened fields feed draftToExtras →
// buildClusterExtrasPayload.
export interface ClusterDraft {
  // --- General ---
  name: string
  description: string
  comment: string
  dataCenterId: string
  // 'undefined' = auto-detect (a real Architecture enum value, always sent)
  cpuArchitecture: string
  cpuType: string
  // '' = leave unset (omitted) so the engine keeps its arch-derived default
  biosType: string
  // FipsMode enum value, always sent ('undefined' = auto-detect)
  fipsMode: string
  version: string
  switchType: string
  firewallType: string
  virtService: boolean
  glusterService: boolean
  // string so the number input stays controlled while empty; '' = omit
  logMaxThreshold: string
  logMaxThresholdType: string
  // /dev/hwrng membership toggle + the loaded source list it edits. The list is
  // only re-sent when membership actually changed (see draftToExtras).
  hwrngRequired: boolean
  loadedRngSources: string[]
  // --- Optimization ---
  overCommit: string
  ballooning: boolean
  threadsAsCores: boolean
  ksmEnabled: boolean
  ksmMergeAcrossNodes: boolean
  haReservation: boolean
  // '' = Engine default / inherit (omitted from the payload)
  schedulingPolicyId: string
  // --- Migration ---
  // MigrateOnError enum value, always sent ('migrate' is the engine default)
  resiliencePolicy: string
  bandwidthMethod: MigrationBandwidthMethod
  // string so the number input stays controlled while empty; '' when not custom
  customBandwidth: string
  // InheritableBoolean string enum ('inherit' | 'true' | 'false')
  migrationEncrypted: string
  parallelMigrationsPolicy: string
  // string so the number input stays controlled while empty ('' when not custom)
  customParallelMigrations: string
  // --- Fencing policy ---
  fencingEnabled: boolean
  skipIfSdActive: boolean
  skipIfConnBroken: boolean
  connBrokenThreshold: string
  skipIfGlusterBricksUp: boolean
  skipIfGlusterQuorumNotMet: boolean
  // --- Console ---
  spiceProxyEnabled: boolean
  spiceProxy: string
  vncEncryption: boolean
  // --- MAC address pool --- '' = Engine default / inherit (omitted)
  macPoolId: string
}

// Cluster read model → fully-populated draft. Every optional field is given a
// concrete fallback so the returned draft has no undefined members. Version and
// over-commit collapse to the nearest offered option when the wire value is
// absent or off-list, keeping the selects controlled. The deepened fields seed
// directly from the read model (the schema already coerces enabled/threshold to
// boolean/number), so an untouched edit re-sends the cluster's current values —
// acceptable, matching the base form.
export function clusterToDraft(cluster: Cluster): ClusterDraft {
  const major = cluster.version?.major
  const minor = cluster.version?.minor
  const version = major !== undefined && minor !== undefined ? `${major}.${minor}` : ''
  const percent = cluster.memory_policy?.over_commit?.percent
  const overCommit = percent !== undefined ? String(percent) : ''
  const method = cluster.migration?.bandwidth?.assignment_method
  const bandwidthMethod: MigrationBandwidthMethod =
    method === 'auto' || method === 'hypervisor_default' || method === 'custom' ? method : 'auto'
  const customValue = cluster.migration?.bandwidth?.custom_value
  const threshold = cluster.fencing_policy?.skip_if_connectivity_broken?.threshold
  const logThreshold = cluster.log_max_memory_used_threshold
  const rngSources = cluster.required_rng_sources?.required_rng_source ?? []
  const parallelCustom = cluster.migration?.custom_parallel_migrations
  return {
    name: cluster.name ?? '',
    description: cluster.description ?? '',
    comment: cluster.comment ?? '',
    dataCenterId: cluster.data_center?.id ?? '',
    cpuArchitecture: cluster.cpu?.architecture ?? 'undefined',
    cpuType: cluster.cpu?.type ?? '',
    biosType: cluster.bios_type ?? '',
    fipsMode: cluster.fips_mode ?? 'undefined',
    version: COMPAT_VERSIONS.includes(version) ? version : COMPAT_VERSIONS[0],
    switchType: cluster.switch_type ?? 'legacy',
    firewallType: cluster.firewall_type ?? 'firewalld',
    virtService: cluster.virt_service ?? true,
    glusterService: cluster.gluster_service ?? false,
    logMaxThreshold: logThreshold !== undefined ? String(logThreshold) : '',
    logMaxThresholdType: cluster.log_max_memory_used_threshold_type ?? 'percentage',
    hwrngRequired: rngSources.includes('hwrng'),
    loadedRngSources: rngSources,
    overCommit: OVER_COMMIT_OPTIONS.some((option) => option.value === overCommit)
      ? overCommit
      : '100',
    ballooning: cluster.ballooning_enabled ?? false,
    threadsAsCores: cluster.threads_as_cores ?? false,
    ksmEnabled: cluster.ksm?.enabled ?? false,
    ksmMergeAcrossNodes: cluster.ksm?.merge_across_nodes ?? true,
    haReservation: cluster.ha_reservation ?? false,
    schedulingPolicyId: cluster.scheduling_policy?.id ?? '',
    resiliencePolicy: cluster.error_handling?.on_error ?? 'migrate',
    bandwidthMethod,
    customBandwidth: customValue !== undefined ? String(customValue) : '',
    migrationEncrypted: cluster.migration?.encrypted ?? 'inherit',
    parallelMigrationsPolicy: cluster.migration?.parallel_migrations_policy ?? 'inherit',
    customParallelMigrations: parallelCustom !== undefined ? String(parallelCustom) : '',
    fencingEnabled: cluster.fencing_policy?.enabled ?? true,
    skipIfSdActive: cluster.fencing_policy?.skip_if_sd_active?.enabled ?? true,
    skipIfConnBroken: cluster.fencing_policy?.skip_if_connectivity_broken?.enabled ?? false,
    connBrokenThreshold: threshold !== undefined ? String(threshold) : '50',
    skipIfGlusterBricksUp: cluster.fencing_policy?.skip_if_gluster_bricks_up ?? false,
    skipIfGlusterQuorumNotMet: cluster.fencing_policy?.skip_if_gluster_quorum_not_met ?? false,
    spiceProxyEnabled: (cluster.display?.proxy ?? '') !== '',
    spiceProxy: cluster.display?.proxy ?? '',
    vncEncryption: cluster.vnc_encryption ?? false,
    macPoolId: cluster.mac_pool?.id ?? '',
  }
}

// Blank create-mode defaults. Scheduling policy + MAC pool stay '' (inherit,
// omitted) unless the user picks one; switch/firewall/fencing/bandwidth carry
// the webadmin ClusterModel defaults (switch legacy, firewall firewalld,
// fencing enabled + skip-if-SD-active on, threshold 50, bandwidth auto). Note:
// webadmin actually defaults skip-if-conn-broken to true; this pass follows the
// contract's explicit false so the connectivity threshold stays hidden until
// the admin opts in.
export function blankDraft(): ClusterDraft {
  return {
    name: '',
    description: '',
    comment: '',
    dataCenterId: '',
    cpuArchitecture: 'undefined',
    cpuType: '',
    biosType: '',
    fipsMode: 'undefined',
    version: COMPAT_VERSIONS[0],
    switchType: 'legacy',
    firewallType: 'firewalld',
    // webadmin ClusterModel defaults: virt on, gluster off
    virtService: true,
    glusterService: false,
    logMaxThreshold: '',
    logMaxThresholdType: 'percentage',
    hwrngRequired: false,
    loadedRngSources: [],
    overCommit: '100',
    ballooning: false,
    threadsAsCores: false,
    // KSM defaults off; when enabled, webadmin defaults merge-across-nodes on
    ksmEnabled: false,
    ksmMergeAcrossNodes: true,
    haReservation: false,
    schedulingPolicyId: '',
    resiliencePolicy: 'migrate',
    bandwidthMethod: 'auto',
    customBandwidth: '',
    migrationEncrypted: 'inherit',
    parallelMigrationsPolicy: 'inherit',
    customParallelMigrations: '',
    fencingEnabled: true,
    skipIfSdActive: true,
    skipIfConnBroken: false,
    connBrokenThreshold: '50',
    skipIfGlusterBricksUp: false,
    skipIfGlusterQuorumNotMet: false,
    spiceProxyEnabled: false,
    spiceProxy: '',
    vncEncryption: false,
    macPoolId: '',
  }
}

// Draft → POST/PUT body for the BASE (General/Optimization core) fields. Mirrors
// the Cluster read model shape the schema coerces on the way back. data_center
// is create-only (a cluster's DC is fixed after creation); cpu is omitted when
// Auto detect ('') is chosen.
function draftToPayload(draft: ClusterDraft, isEdit: boolean): Record<string, unknown> {
  const [major, minor] = draft.version.split('.').map(Number)
  const payload: Record<string, unknown> = {
    name: draft.name,
    description: draft.description,
    comment: draft.comment,
    version: { major, minor },
    memory_policy: { over_commit: { percent: Number(draft.overCommit) } },
    ballooning_enabled: draft.ballooning,
    // Always-defined scalars seeded from the read model (edit) or webadmin
    // defaults (create) — an untouched edit re-sends the current values, same
    // round-trip contract as the fields above.
    virt_service: draft.virtService,
    gluster_service: draft.glusterService,
    threads_as_cores: draft.threadsAsCores,
    ha_reservation: draft.haReservation,
    ksm: { enabled: draft.ksmEnabled, merge_across_nodes: draft.ksmMergeAcrossNodes },
    vnc_encryption: draft.vncEncryption,
    fips_mode: draft.fipsMode,
    error_handling: { on_error: draft.resiliencePolicy },
  }
  if (!isEdit && draft.dataCenterId) {
    payload.data_center = { id: draft.dataCenterId }
  }
  // cpu: architecture + type pair. 'undefined' arch with no type = full auto
  // detect — omit the block entirely so the engine keeps its own derivation.
  if (draft.cpuType || draft.cpuArchitecture !== 'undefined') {
    const cpu: Record<string, unknown> = { architecture: draft.cpuArchitecture }
    if (draft.cpuType) cpu.type = draft.cpuType
    payload.cpu = cpu
  }
  return payload
}

// Modal draft → ClusterExtrasDraft, honoring omit-unchanged: a field is only set
// when the control is at a meaningful (non-inherit) value, so buildClusterExtras
// omits it and a PUT never clobbers an untouched sub-block.
//   * switch/firewall/fencing/bandwidth are always meaningful (they carry a
//     concrete value in both create and edit — seeded from the cluster in edit,
//     from webadmin defaults in create), so they always ride.
//   * scheduling policy + MAC pool are omitted while at '' (inherit) and only
//     set once the user picks a concrete id.
//   * the SPICE proxy override always sets spiceProxyEnabled so the builder can
//     clear it (empty-string proxy) when disabled.
function draftToExtras(draft: ClusterDraft): ClusterExtrasDraft {
  const extras: ClusterExtrasDraft = {
    switchType: draft.switchType,
    firewallType: draft.firewallType,
    migrationBandwidthMethod: draft.bandwidthMethod,
    migrationEncrypted: draft.migrationEncrypted,
    parallelMigrationsPolicy: draft.parallelMigrationsPolicy,
    fencingEnabled: draft.fencingEnabled,
    skipIfSdActive: draft.skipIfSdActive,
    skipIfConnBroken: draft.skipIfConnBroken,
    skipIfGlusterBricksUp: draft.skipIfGlusterBricksUp,
    skipIfGlusterQuorumNotMet: draft.skipIfGlusterQuorumNotMet,
    spiceProxyEnabled: draft.spiceProxyEnabled,
    spiceProxy: draft.spiceProxy,
  }
  if (draft.bandwidthMethod === 'custom') {
    const mbps = Number(draft.customBandwidth)
    if (Number.isFinite(mbps) && mbps > 0) extras.migrationCustomBandwidth = mbps
  }
  if (draft.parallelMigrationsPolicy === 'custom') {
    const connections = Number(draft.customParallelMigrations)
    if (Number.isFinite(connections) && connections > 0) {
      extras.customParallelMigrations = connections
    }
  }
  // The connectivity threshold only rides when the connectivity guard is on.
  if (draft.skipIfConnBroken) extras.connBrokenThreshold = Number(draft.connBrokenThreshold)
  // Scheduling policy + MAC pool: inherit ('') ⇒ omit.
  if (draft.schedulingPolicyId) extras.schedulingPolicyId = draft.schedulingPolicyId
  if (draft.macPoolId) extras.macPoolId = draft.macPoolId
  // Chipset/firmware: '' (unset) ⇒ omit so the engine keeps its own default.
  if (draft.biosType) extras.biosType = draft.biosType
  // Audit-log memory threshold: '' ⇒ omit; a set value rides with its unit.
  const logThreshold = Number(draft.logMaxThreshold)
  if (draft.logMaxThreshold !== '' && Number.isFinite(logThreshold) && logThreshold > 0) {
    extras.logMaxMemoryThreshold = logThreshold
    extras.logMaxMemoryThresholdType = draft.logMaxThresholdType
  }
  // Entropy sources: only re-send the list when hwrng membership CHANGED —
  // an untouched toggle omits the key entirely, preserving the engine's list
  // (a present-but-empty list would clear it).
  if (draft.hwrngRequired !== draft.loadedRngSources.includes('hwrng')) {
    extras.requiredRngSources = draft.hwrngRequired
      ? [...draft.loadedRngSources, 'hwrng']
      : draft.loadedRngSources.filter((source) => source !== 'hwrng')
  }
  return extras
}

// Assemble the full create/edit body: the base General/Optimization fields plus
// the deepened cluster-depth sub-blocks.
export function buildSavePayload(draft: ClusterDraft, isEdit: boolean): Record<string, unknown> {
  return { ...draftToPayload(draft, isEdit), ...buildClusterExtrasPayload(draftToExtras(draft)) }
}
