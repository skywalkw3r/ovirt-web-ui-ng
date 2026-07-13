import { z } from 'zod'
import { ApiError, request } from '../transport'
import { ClusterListSchema, ClusterSchema, type Cluster } from '../schemas/cluster'
import { NetworkListSchema, type Network } from '../schemas/network'

export async function listClusters(
  opts: { search?: string; signal?: AbortSignal } = {},
): Promise<Cluster[]> {
  // The engine search DSL (e.g. name=prod*) narrows the collection; callers
  // that want the full inventory omit it — mirror resources/events.ts.
  const search = opts.search ? `?search=${encodeURIComponent(opts.search)}` : ''
  const data = ClusterListSchema.parse(await request(`/clusters${search}`, { signal: opts.signal }))
  return data.cluster ?? []
}

// follow=data_center inlines the linked data center (name, etc.); the live
// engine otherwise returns data_center as a bare { id, href } link, so the
// General tab would show an em dash instead of the data center name — same
// rationale as resources/hosts.ts getHost. A cluster with no data_center link
// (rare, but possible on a partially-configured engine) makes the live engine
// answer a followed read with HTTP 500 rather than omitting the key — fall back
// to the bare read so the page still renders (mirror templates.ts getTemplate).
export async function getCluster(id: string): Promise<Cluster> {
  try {
    return ClusterSchema.parse(
      await request(`/clusters/${encodeURIComponent(id)}?follow=data_center`),
    )
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      return ClusterSchema.parse(await request(`/clusters/${encodeURIComponent(id)}`))
    }
    throw error
  }
}

// Webadmin-style create: POST the new cluster's fields. The engine answers
// with the full created cluster, which we parse through ClusterSchema so
// callers (the create modal) get a coerced read model, same as getCluster.
// Mirror resources/networks.ts createNetwork.
export async function createCluster(body: Record<string, unknown>): Promise<Cluster> {
  return ClusterSchema.parse(await request('/clusters', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with the
// full updated cluster, which we parse through ClusterSchema so callers (the
// edit modal's optimistic refetch) get a coerced read model — mirror
// resources/networks.ts updateNetwork.
export async function updateCluster(id: string, body: Record<string, unknown>): Promise<Cluster> {
  return ClusterSchema.parse(
    await request(`/clusters/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the cluster. The engine answers with an empty
// body, so the promise only needs to settle — mirror resources/vms.ts deleteVm.
export async function deleteCluster(id: string): Promise<void> {
  await request(`/clusters/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ─── Rolling upgrade ─────────────────────────────────────────────────────────
// POST /clusters/{id}/upgrade is a BRACKETING marker action, not the upgrade
// itself: it flips the cluster's upgrade_running flag and records the progress
// percent so the UI (and audit log) can track a rolling upgrade. The actual
// per-host work happens through POST /hosts/{id}/upgrade (resources/hosts.ts
// upgradeHost) — the Upgrade action here carries NO host list.
//
// Verified against api-model services/ClusterService.java `Upgrade` (@In
// ClusterUpgradeAction upgradeAction, @In Integer upgradePercentComplete, @In
// String correlationId, @In Boolean async) and types/ClusterUpgradeAction.java
// (START, UPDATE_PROGRESS, FINISH). NOTE: the enum's terminal value is `finish`
// — there is NO `stop` value (the job brief's guess), so 'finish' is the wire
// action; the modal's user-facing "Stop" button maps to it.
export type ClusterUpgradeAction = 'start' | 'update_progress' | 'finish'

export interface ClusterUpgradeSpec {
  upgradeAction: ClusterUpgradeAction
  // percent 0..100 — only meaningful with the 'update_progress' action
  upgradePercentComplete?: number
  // correlate the rolling upgrade's audit-log events to this run; when omitted
  // the engine falls back to the Correlation-Id request header
  correlationId?: string
}

export async function clusterUpgrade(id: string, spec: ClusterUpgradeSpec): Promise<void> {
  const body: Record<string, unknown> = { upgrade_action: spec.upgradeAction }
  if (spec.upgradePercentComplete !== undefined) {
    body.upgrade_percent_complete = spec.upgradePercentComplete
  }
  if (spec.correlationId !== undefined) body.correlation_id = spec.correlationId
  await request(`/clusters/${encodeURIComponent(id)}/upgrade`, { method: 'POST', body })
}

// The engine carries an in-progress rolling upgrade on the cluster's
// `upgrade_running` boolean. ClusterSchema is a looseObject, so the field
// survives the parse as an untyped passthrough even though it is not a declared
// key (the schema is owned elsewhere) — read it defensively and coerce the live
// engine's JSON-string boolean form. Drives the ClustersPage upgrade-status
// column marker.
export function isClusterUpgradeRunning(cluster: Cluster): boolean {
  const raw = (cluster as Record<string, unknown>).upgrade_running
  return raw === true || raw === 'true'
}

// The logical networks assigned to the cluster (the Networks tab). Shares the
// flat NetworkSchema with the /networks collection.
export async function listClusterNetworks(id: string): Promise<Network[]> {
  const data = NetworkListSchema.parse(
    await request(`/clusters/${encodeURIComponent(id)}/networks`),
  )
  return data.network ?? []
}

// The scheduling-policy options the cluster form's Scheduling Policy select
// lists. A top-level collection (key `scheduling_policy`) — the cluster carries
// only a bare { id } link, so its current policy name is resolved client-side
// against this list (never ?follow=-ed off the cluster, where the OPTIONAL link
// 500s). 404-tolerant → [] for an engine/mock without the route.
export const SchedulingPolicySchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
})

export const SchedulingPolicyListSchema = z.looseObject({
  scheduling_policy: z.array(SchedulingPolicySchema).optional(),
})

export type SchedulingPolicy = z.infer<typeof SchedulingPolicySchema>

export async function listSchedulingPolicies(): Promise<SchedulingPolicy[]> {
  try {
    const data = SchedulingPolicyListSchema.parse(await request('/schedulingpolicies'))
    return data.scheduling_policy ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The MAC-pool options the cluster form's MAC Pool select lists come from the
// engine-global /macpools collection, now owned by resources/macPools.ts (the
// MAC-pool admin page manages the same collection with full CRUD). The schema
// and list fn are re-exported here so the cluster form's existing
// `import { listMacPools } from './clusters'` keeps resolving; the richer
// MacPoolSchema is a superset of the { id, name } the select uses, so the
// consumer is unaffected.
export { MacPoolSchema, MacPoolListSchema, type MacPool } from '../schemas/mac-pool'
export { listMacPools } from './macPools'

// An AffinityRule ({ enabled, positive, enforcing }) drives one axis of a
// group. `positive:true` keeps members together, `false` apart; `enabled:false`
// disables the axis. The live engine serializes each flag as a JSON string.
const AffinityRuleSchema = z.looseObject({
  enabled: z.union([z.boolean(), z.stringbool()]).optional(),
  positive: z.union([z.boolean(), z.stringbool()]).optional(),
  enforcing: z.union([z.boolean(), z.stringbool()]).optional(),
})

// A bare member/label reference — the engine returns members as { id, href }
// links; names are resolved client-side against cached listVms/listHosts.
const AffinityRefSchema = z.looseObject({ id: z.string(), name: z.string().optional() })

export const ClusterAffinityGroupSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  // priority rides as a JSON string on the live engine
  priority: z.coerce.number().optional(),
  // Preferred nested rules; the top-level enforcing/positive below are the
  // engine's DEPRECATED fallbacks (present only when vms_rule is absent).
  vms_rule: AffinityRuleSchema.optional(),
  hosts_rule: AffinityRuleSchema.optional(),
  enforcing: z.union([z.boolean(), z.stringbool()]).optional(),
  positive: z.union([z.boolean(), z.stringbool()]).optional(),
  // Members — present when the read follows vms,hosts (subcollection follow is
  // always safe). The engine omits the inner array key when the list is empty.
  vms: z.looseObject({ vm: z.array(AffinityRefSchema).optional() }).optional(),
  hosts: z.looseObject({ host: z.array(AffinityRefSchema).optional() }).optional(),
  vm_labels: z.looseObject({ affinity_label: z.array(AffinityRefSchema).optional() }).optional(),
  host_labels: z.looseObject({ affinity_label: z.array(AffinityRefSchema).optional() }).optional(),
})

export const ClusterAffinityGroupListSchema = z.looseObject({
  affinity_group: z.array(ClusterAffinityGroupSchema).optional(),
})

export type ClusterAffinityGroup = z.infer<typeof ClusterAffinityGroupSchema>

// Affinity groups are optional on a cluster: engines with none defined answer
// 404 for the whole subcollection rather than an empty list — mirror the
// 404-tolerant hosts.ts listHostHooks path.
export async function listClusterAffinityGroups(id: string): Promise<ClusterAffinityGroup[]> {
  try {
    const data = ClusterAffinityGroupListSchema.parse(
      await request(`/clusters/${encodeURIComponent(id)}/affinitygroups`),
    )
    return data.affinity_group ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The CRUD table needs each group's members for a Members column, so this read
// follows vms,hosts. Following a group's OWN subcollections is always safe (they
// are present, never OPTIONAL links — unlike a cluster's mac_pool/scheduling
// links, which 500 when followed). 404-tolerant → [] for a cluster with none.
export async function listClusterAffinityGroupsFull(id: string): Promise<ClusterAffinityGroup[]> {
  try {
    const data = ClusterAffinityGroupListSchema.parse(
      await request(`/clusters/${encodeURIComponent(id)}/affinitygroups?follow=vms,hosts`),
    )
    return data.affinity_group ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Webadmin-style create: POST the new group's fields to the cluster's
// affinitygroups subcollection. The engine answers with the full created group,
// parsed through the schema so the caller gets a coerced read model. The engine
// requires a name (400 otherwise) and rejects a duplicate in-cluster name (409);
// both faults surface verbatim via ApiError. Bare read of the response — never
// ?follow= here.
export async function createClusterAffinityGroup(
  clusterId: string,
  body: Record<string, unknown>,
): Promise<ClusterAffinityGroup> {
  return ClusterAffinityGroupSchema.parse(
    await request(`/clusters/${encodeURIComponent(clusterId)}/affinitygroups`, {
      method: 'POST',
      body,
    }),
  )
}

// Webadmin-style edit: PUT the changed fields back. CLEAR-TO-NONE — a body that
// includes vms:{vm:[]} clears all VM members; OMITTING vms preserves them
// (AffinityGroupMapper runs extractIds on any set collection, empty included).
// Same for hosts/vm_labels/host_labels and the rule sub-fields. The payload
// builder below encodes that discipline. Bare read of the response.
export async function updateClusterAffinityGroup(
  clusterId: string,
  groupId: string,
  body: Record<string, unknown>,
): Promise<ClusterAffinityGroup> {
  return ClusterAffinityGroupSchema.parse(
    await request(
      `/clusters/${encodeURIComponent(clusterId)}/affinitygroups/${encodeURIComponent(groupId)}`,
      { method: 'PUT', body },
    ),
  )
}

// Webadmin-style remove: DELETE the group. The engine answers with an empty
// body, so the promise only needs to settle — mirror deleteCluster.
export async function deleteClusterAffinityGroup(
  clusterId: string,
  groupId: string,
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/affinitygroups/${encodeURIComponent(groupId)}`,
    { method: 'DELETE' },
  )
}

// Affinity labels are engine-GLOBAL objects (the /affinitylabels top-level
// collection), not a cluster subcollection — a label associates to a cluster
// implicitly via its member hosts/VMs. The schema carries the members so the
// CRUD tab can render and edit them; the engine omits the inner array key when
// a list is empty.
export const AffinityLabelSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  hosts: z.looseObject({ host: z.array(AffinityRefSchema).optional() }).optional(),
  vms: z.looseObject({ vm: z.array(AffinityRefSchema).optional() }).optional(),
})

export const AffinityLabelListSchema = z.looseObject({
  affinity_label: z.array(AffinityLabelSchema).optional(),
})

export type AffinityLabel = z.infer<typeof AffinityLabelSchema>

// The cluster/VM/host read tabs only need the label's id+name, so those
// subcollection reads keep the leaner alias below; the global collection read
// and the CRUD writes use the full AffinityLabel shape.
export const ClusterAffinityLabelSchema = AffinityLabelSchema
export const ClusterAffinityLabelListSchema = AffinityLabelListSchema
export type ClusterAffinityLabel = AffinityLabel

// The labels associated with a cluster (its Affinity Labels read tab). Optional:
// some engines answer 404 for the subcollection rather than an empty list
// (mirror hosts.ts listHostAffinityLabels).
export async function listClusterAffinityLabels(id: string): Promise<ClusterAffinityLabel[]> {
  try {
    const data = ClusterAffinityLabelListSchema.parse(
      await request(`/clusters/${encodeURIComponent(id)}/affinitylabels`),
    )
    return data.affinity_label ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The global /affinitylabels collection the label CRUD tab manages. 404-tolerant
// → [] for an engine with none defined (mirror the subcollection reads).
export async function listAffinityLabels(): Promise<AffinityLabel[]> {
  try {
    const data = AffinityLabelListSchema.parse(await request('/affinitylabels'))
    return data.affinity_label ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Webadmin-style create: POST the new label to the global collection. The engine
// requires a name (400) and rejects a duplicate name (409); both surface via
// ApiError. Answers with the full created label, parsed through the schema.
export async function createAffinityLabel(body: Record<string, unknown>): Promise<AffinityLabel> {
  return AffinityLabelSchema.parse(await request('/affinitylabels', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. CLEAR-TO-NONE — hosts:{host:
// []} clears all host members; OMITTING hosts preserves them (same rule as
// affinity groups). The payload builder below encodes that discipline.
export async function updateAffinityLabel(
  id: string,
  body: Record<string, unknown>,
): Promise<AffinityLabel> {
  return AffinityLabelSchema.parse(
    await request(`/affinitylabels/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the label. The engine answers with an empty
// body, so the promise only needs to settle.
export async function deleteAffinityLabel(id: string): Promise<void> {
  await request(`/affinitylabels/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export const ClusterCpuProfileSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  // The CPU-kind QoS the profile caps hosts with — a bare { id, href } link,
  // present only when a QoS is assigned. Its name is resolved client-side
  // against the data center's QoS list (the same 404-tolerant listDataCenterQoss
  // the vNIC-profile form reads), never ?follow=-ed off the profile.
  qos: z.looseObject({ id: z.string().optional() }).optional(),
})

export const ClusterCpuProfileListSchema = z.looseObject({
  cpu_profile: z.array(ClusterCpuProfileSchema).optional(),
})

export type ClusterCpuProfile = z.infer<typeof ClusterCpuProfileSchema>

// CPU profiles are optional: an engine with none defined on the cluster answers
// 404 for the subcollection rather than an empty list (404-tolerant → []).
export async function listClusterCpuProfiles(id: string): Promise<ClusterCpuProfile[]> {
  try {
    const data = ClusterCpuProfileListSchema.parse(
      await request(`/clusters/${encodeURIComponent(id)}/cpuprofiles`),
    )
    return data.cpu_profile ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Webadmin-style create: POST the new CPU profile (name + optional QoS link) to
// the cluster's cpuprofiles subcollection. The cluster is IMPLIED by the URL, so
// the body carries only name/description/qos (AssignedCpuProfilesService.add
// mandates just the name). The engine echoes the created profile, parsed through
// the schema so the caller gets a coerced read model — mirror createDataCenterQos.
export async function createClusterCpuProfile(
  clusterId: string,
  body: Record<string, unknown>,
): Promise<ClusterCpuProfile> {
  return ClusterCpuProfileSchema.parse(
    await request(`/clusters/${encodeURIComponent(clusterId)}/cpuprofiles`, {
      method: 'POST',
      body,
    }),
  )
}

// Webadmin-style edit: PUT the changed fields. The ASSIGNED subcollection service
// (/clusters/{id}/cpuprofiles/{id}) exposes only GET+DELETE — there is NO PUT
// there — so an update targets the TOP-LEVEL /cpuprofiles/{id}
// (CpuProfileService.update), where the very same profile is addressable
// (verified against the api-model: AssignedCpuProfileService has no Update,
// CpuProfileService does). The engine echoes the updated profile.
export async function updateCpuProfile(
  profileId: string,
  body: Record<string, unknown>,
): Promise<ClusterCpuProfile> {
  return ClusterCpuProfileSchema.parse(
    await request(`/cpuprofiles/${encodeURIComponent(profileId)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the profile from the cluster's subcollection. The
// engine answers with an empty body, so the promise only needs to settle. A
// profile still referenced by a VM is rejected (the engine's in-use fault); we do
// not pre-check, letting that fault surface verbatim — mirror deleteDataCenterQos.
export async function deleteClusterCpuProfile(clusterId: string, profileId: string): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/cpuprofiles/${encodeURIComponent(profileId)}`,
    { method: 'DELETE' },
  )
}

// The flat CPU-profile draft the New/Edit modal holds — name + description + a
// QoS id ('' = No QoS). Kept beside the resource so the wire shaping is unit-
// testable, mirroring the affinity payload builders.
export interface CpuProfileDraft {
  name: string
  description: string
  // '' = No QoS
  qosId: string
}

// Build the CPU profile POST/PUT body. name is mandatory (the engine 400s
// without it) and always trimmed; description always rides so an emptied field
// clears. qos is a NULLABLE link: a chosen id sends { id }; on EDIT an empty
// selection sends an explicit empty object to CLEAR the association (the engine's
// CpuProfileMapper nulls a PRESENT-but-id-less link and PRESERVES an absent one —
// the same clear-to-none rule the vNIC-profile filter/qos use), while on CREATE
// there is nothing to clear so it is omitted.
export function buildCpuProfilePayload(
  draft: CpuProfileDraft,
  opts: { isEdit: boolean },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: draft.name.trim(),
    description: draft.description.trim(),
  }
  if (draft.qosId) body.qos = { id: draft.qosId }
  else if (opts.isEdit) body.qos = {}
  return body
}

// The permission slice the cluster detail Permissions tab renders: the role
// name and whether it is an administrative role. Same coercion note as
// resources/hosts.ts — the engine serializes `administrative` as a JSON string.
export const ClusterPermissionSchema = z.looseObject({
  id: z.string().optional(),
  role: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      administrative: z.union([z.boolean(), z.stringbool()]).optional(),
    })
    .optional(),
})

export const ClusterPermissionListSchema = z.looseObject({
  permission: z.array(ClusterPermissionSchema).optional(),
})

export type ClusterPermission = z.infer<typeof ClusterPermissionSchema>

// Permissions are an optional subcollection: a cluster without any assigned
// answers 404 for the whole collection (404-tolerant → []).
export async function listClusterPermissions(id: string): Promise<ClusterPermission[]> {
  try {
    const data = ClusterPermissionListSchema.parse(
      await request(`/clusters/${encodeURIComponent(id)}/permissions?follow=role`),
    )
    return data.permission ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// ---------------------------------------------------------------------------
// Payload builders
//
// The cluster form and the affinity modals hold a flat draft and hand it here
// to produce the REST body. Centralizing the wire shaping keeps the two
// load-bearing engine subtleties in one testable place:
//   * omit-unchanged — a body key is only present when the draft meaningfully
//     sets it, so a PUT never clobbers a field the user did not touch (the
//     engine ClusterMapper maps a sub-block only under its isSet* guard);
//   * clear-to-none — for affinity member/label collections the engine treats a
//     PRESENT-but-empty list as "clear all" and an ABSENT key as "preserve", so
//     the builders emit `{ vm: [] }` to clear and omit the key to preserve.
// ---------------------------------------------------------------------------

// The migration bandwidth assignment method — mirrors the webadmin radio.
export type MigrationBandwidthMethod = 'auto' | 'hypervisor_default' | 'custom'

// The new-in-this-pass cluster fields the deepened form drives. Every field is
// optional: an undefined field is omitted from the body (preserve), matching
// the existing create/update discipline. `data_center` stays create-only and is
// intentionally absent here.
export interface ClusterExtrasDraft {
  schedulingPolicyId?: string
  // scheduling_policy.properties.property[] — key/value custom properties
  schedulingPolicyProperties?: { name: string; value: string }[]
  migrationPolicyId?: string
  migrationBandwidthMethod?: MigrationBandwidthMethod
  // Mbps; required + positive when the method is 'custom'
  migrationCustomBandwidth?: number
  fencingEnabled?: boolean
  skipIfSdActive?: boolean
  skipIfConnBroken?: boolean
  // percent: 25 | 50 | 75 | 100
  connBrokenThreshold?: number
  // when false, the SPICE proxy override is cleared with an empty-string proxy
  spiceProxyEnabled?: boolean
  spiceProxy?: string
  macPoolId?: string
  switchType?: string
  firewallType?: string
}

// Translate the deepened-form draft into the body keys ClusterMapper honors
// (see the CONTRACT wire table). Only sub-blocks the draft actually sets are
// emitted; the caller spreads this over the existing General/Optimization body.
export function buildClusterExtrasPayload(draft: ClusterExtrasDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (draft.schedulingPolicyId !== undefined) {
    const policy: Record<string, unknown> = { id: draft.schedulingPolicyId }
    if (draft.schedulingPolicyProperties !== undefined) {
      policy.properties = { property: draft.schedulingPolicyProperties }
    }
    body.scheduling_policy = policy
  }

  // Migration: send the policy and/or the bandwidth sub-object only when set.
  // For 'custom' the engine wants the Mbps in custom_value; the other methods
  // carry only the assignment_method.
  if (draft.migrationPolicyId !== undefined || draft.migrationBandwidthMethod !== undefined) {
    const migration: Record<string, unknown> = {}
    if (draft.migrationPolicyId !== undefined) {
      migration.policy = { id: draft.migrationPolicyId }
    }
    if (draft.migrationBandwidthMethod !== undefined) {
      const bandwidth: Record<string, unknown> = {
        assignment_method: draft.migrationBandwidthMethod,
      }
      if (
        draft.migrationBandwidthMethod === 'custom' &&
        draft.migrationCustomBandwidth !== undefined
      ) {
        bandwidth.custom_value = draft.migrationCustomBandwidth
      }
      migration.bandwidth = bandwidth
    }
    body.migration = migration
  }

  // Fencing: emit the whole policy sub-object only when the enable toggle is
  // set. The two skip guards ride nested, each with its own enabled flag; the
  // connectivity guard also carries the threshold percent.
  if (draft.fencingEnabled !== undefined) {
    const fencing: Record<string, unknown> = { enabled: draft.fencingEnabled }
    if (draft.skipIfSdActive !== undefined) {
      fencing.skip_if_sd_active = { enabled: draft.skipIfSdActive }
    }
    if (draft.skipIfConnBroken !== undefined) {
      const skip: Record<string, unknown> = { enabled: draft.skipIfConnBroken }
      if (draft.connBrokenThreshold !== undefined) skip.threshold = draft.connBrokenThreshold
      fencing.skip_if_connectivity_broken = skip
    }
    body.fencing_policy = fencing
  }

  // Console: CLEAR-TO-NONE — an empty-string proxy clears the override. Only
  // emit display when the toggle is defined so an untouched form preserves it.
  if (draft.spiceProxyEnabled !== undefined) {
    body.display = { proxy: draft.spiceProxyEnabled ? (draft.spiceProxy ?? '') : '' }
  }

  if (draft.macPoolId !== undefined) body.mac_pool = { id: draft.macPoolId }
  if (draft.switchType !== undefined) body.switch_type = draft.switchType
  if (draft.firewallType !== undefined) body.firewall_type = draft.firewallType

  return body
}

// ---------------------------------------------------------------------------
// Migration policies
//
// These are a fixed set of engine BUILT-INS, not a REST collection: the
// api-model SystemService exposes NO migrationpolicies locator (verified — the
// only *policy* collections are schedulingpolicies / schedulingpolicyunits), and
// a cluster carries only a bare migration.policy.id GUID (?follow=-ing it 500s,
// like scheduling_policy / mac_pool). Webadmin fills its dropdown from the
// engine's `MigrationPolicies` config value; the ids + names below are that
// config's 4.8-level defaults verbatim (Legacy is Guid.Empty — the
// NoMigrationPolicy id). The cluster form seeds the select from the cluster's
// current policy id and keeps an off-list (admin-customized) id selectable so a
// save never rewrites it. A future engine build could grow a real collection —
// swap this constant for a 404-tolerant list fn then; the form is agnostic.
// ---------------------------------------------------------------------------
export interface MigrationPolicy {
  id: string
  name: string
  description?: string
}

export const MIGRATION_POLICIES: MigrationPolicy[] = [
  { id: '00000000-0000-0000-0000-000000000000', name: 'Legacy' },
  { id: '80554327-0569-496b-bdeb-fcbbf52b827b', name: 'Minimal downtime' },
  { id: '80554327-0569-496b-bdeb-fcbbf52b827c', name: 'Suspend workload if needed' },
  { id: 'a7aeedb2-8d66-4e51-bb22-32595027ce71', name: 'Post-copy migration' },
  { id: '57237b82-b8c2-425f-b425-114b35219626', name: 'Very large VMs' },
]

// Merge a chosen migration policy id into an already-assembled cluster payload
// WITHOUT clobbering a migration.bandwidth sub-block the base builder emitted
// (buildClusterExtrasPayload always ships bandwidth). '' (Engine default /
// inherit) leaves the payload untouched so an untouched policy is preserved. The
// cluster form's Save runs this over buildSavePayload's result — the migration
// policy rides beside the form's own draft rather than inside it, so this stays
// the single testable seam that shapes the migration.policy wire key.
export function applyMigrationPolicy(
  payload: Record<string, unknown>,
  policyId: string,
): Record<string, unknown> {
  if (!policyId) return payload
  const migration = {
    ...(payload.migration as Record<string, unknown> | undefined),
    policy: { id: policyId },
  }
  return { ...payload, migration }
}

// The affinity axis polarity the group form's VM/host selector exposes.
// 'disabled' maps to enabled:false; 'positive'/'negative' set the positive flag.
export type AffinityPolarity = 'positive' | 'negative' | 'disabled'

export interface AffinityGroupDraft {
  name?: string
  description?: string
  priority?: number
  vmPolarity?: AffinityPolarity
  vmEnforcing?: boolean
  hostPolarity?: AffinityPolarity
  hostEnforcing?: boolean
  // Member ids. undefined ⇒ omit the collection (preserve on the engine);
  // an empty array ⇒ send { vm: [] } to CLEAR all members.
  vmIds?: string[]
  hostIds?: string[]
}

function affinityRule(
  polarity: AffinityPolarity,
  enforcing: boolean | undefined,
): Record<string, unknown> {
  return {
    enabled: polarity !== 'disabled',
    positive: polarity !== 'negative',
    enforcing: enforcing ?? false,
  }
}

// Build the AffinityGroup POST/PUT body. Rules ride as the preferred nested
// vms_rule/hosts_rule ({ enabled, positive, enforcing }); the deprecated
// top-level positive/enforcing are never sent. Member ids honor CLEAR-TO-NONE:
// undefined omits the collection (preserve), an empty array sends { vm: [] }
// (clear all). On create, pass explicit ids/polarities so nothing is ambiguous.
export function buildAffinityGroupPayload(draft: AffinityGroupDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (draft.name !== undefined) body.name = draft.name
  if (draft.description !== undefined) body.description = draft.description
  if (draft.priority !== undefined) body.priority = draft.priority
  if (draft.vmPolarity !== undefined)
    body.vms_rule = affinityRule(draft.vmPolarity, draft.vmEnforcing)
  if (draft.hostPolarity !== undefined) {
    body.hosts_rule = affinityRule(draft.hostPolarity, draft.hostEnforcing)
  }
  if (draft.vmIds !== undefined) body.vms = { vm: draft.vmIds.map((id) => ({ id })) }
  if (draft.hostIds !== undefined) body.hosts = { host: draft.hostIds.map((id) => ({ id })) }

  return body
}

export interface AffinityLabelDraft {
  name?: string
  // undefined ⇒ omit (preserve); empty array ⇒ { host: [] } (clear all).
  hostIds?: string[]
  vmIds?: string[]
}

// Build the AffinityLabel POST/PUT body. Webadmin sets exactly name, hosts, vms;
// members honor the same CLEAR-TO-NONE rule as affinity groups.
export function buildAffinityLabelPayload(draft: AffinityLabelDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (draft.name !== undefined) body.name = draft.name
  if (draft.hostIds !== undefined) body.hosts = { host: draft.hostIds.map((id) => ({ id })) }
  if (draft.vmIds !== undefined) body.vms = { vm: draft.vmIds.map((id) => ({ id })) }

  return body
}
