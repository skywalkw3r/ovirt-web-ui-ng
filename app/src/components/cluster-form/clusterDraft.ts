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

// The flat, always-defined draft the modal owns. Selects ride as strings
// (FormSelect values are strings) and are coerced on the way out. The base
// fields feed draftToPayload; the deepened fields feed draftToExtras →
// buildClusterExtrasPayload.
export interface ClusterDraft {
  // --- General ---
  name: string
  description: string
  dataCenterId: string
  cpuType: string
  version: string
  switchType: string
  firewallType: string
  // --- Optimization ---
  overCommit: string
  ballooning: boolean
  // '' = Engine default / inherit (omitted from the payload)
  schedulingPolicyId: string
  // --- Migration ---
  bandwidthMethod: MigrationBandwidthMethod
  // string so the number input stays controlled while empty; '' when not custom
  customBandwidth: string
  // --- Fencing policy ---
  fencingEnabled: boolean
  skipIfSdActive: boolean
  skipIfConnBroken: boolean
  connBrokenThreshold: string
  // --- Console ---
  spiceProxyEnabled: boolean
  spiceProxy: string
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
  return {
    name: cluster.name ?? '',
    description: cluster.description ?? '',
    dataCenterId: cluster.data_center?.id ?? '',
    cpuType: cluster.cpu?.type ?? '',
    version: COMPAT_VERSIONS.includes(version) ? version : COMPAT_VERSIONS[0],
    switchType: cluster.switch_type ?? 'legacy',
    firewallType: cluster.firewall_type ?? 'firewalld',
    overCommit: OVER_COMMIT_OPTIONS.some((option) => option.value === overCommit)
      ? overCommit
      : '100',
    ballooning: cluster.ballooning_enabled ?? false,
    schedulingPolicyId: cluster.scheduling_policy?.id ?? '',
    bandwidthMethod,
    customBandwidth: customValue !== undefined ? String(customValue) : '',
    fencingEnabled: cluster.fencing_policy?.enabled ?? true,
    skipIfSdActive: cluster.fencing_policy?.skip_if_sd_active?.enabled ?? true,
    skipIfConnBroken: cluster.fencing_policy?.skip_if_connectivity_broken?.enabled ?? false,
    connBrokenThreshold: threshold !== undefined ? String(threshold) : '50',
    spiceProxyEnabled: (cluster.display?.proxy ?? '') !== '',
    spiceProxy: cluster.display?.proxy ?? '',
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
    dataCenterId: '',
    cpuType: '',
    version: COMPAT_VERSIONS[0],
    switchType: 'legacy',
    firewallType: 'firewalld',
    overCommit: '100',
    ballooning: false,
    schedulingPolicyId: '',
    bandwidthMethod: 'auto',
    customBandwidth: '',
    fencingEnabled: true,
    skipIfSdActive: true,
    skipIfConnBroken: false,
    connBrokenThreshold: '50',
    spiceProxyEnabled: false,
    spiceProxy: '',
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
    version: { major, minor },
    memory_policy: { over_commit: { percent: Number(draft.overCommit) } },
    ballooning_enabled: draft.ballooning,
  }
  if (!isEdit && draft.dataCenterId) {
    payload.data_center = { id: draft.dataCenterId }
  }
  if (draft.cpuType) {
    payload.cpu = { type: draft.cpuType }
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
    fencingEnabled: draft.fencingEnabled,
    skipIfSdActive: draft.skipIfSdActive,
    skipIfConnBroken: draft.skipIfConnBroken,
    spiceProxyEnabled: draft.spiceProxyEnabled,
    spiceProxy: draft.spiceProxy,
  }
  if (draft.bandwidthMethod === 'custom') {
    const mbps = Number(draft.customBandwidth)
    if (Number.isFinite(mbps) && mbps > 0) extras.migrationCustomBandwidth = mbps
  }
  // The connectivity threshold only rides when the connectivity guard is on.
  if (draft.skipIfConnBroken) extras.connBrokenThreshold = Number(draft.connBrokenThreshold)
  // Scheduling policy + MAC pool: inherit ('') ⇒ omit.
  if (draft.schedulingPolicyId) extras.schedulingPolicyId = draft.schedulingPolicyId
  if (draft.macPoolId) extras.macPoolId = draft.macPoolId
  return extras
}

// Assemble the full create/edit body: the base General/Optimization fields plus
// the deepened cluster-depth sub-blocks.
export function buildSavePayload(draft: ClusterDraft, isEdit: boolean): Record<string, unknown> {
  return { ...draftToPayload(draft, isEdit), ...buildClusterExtrasPayload(draftToExtras(draft)) }
}
