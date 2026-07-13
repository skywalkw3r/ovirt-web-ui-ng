import { z } from 'zod'
import { ApiError, request } from '../transport'

// Scheduling policies — the full-CRUD owner of /schedulingpolicies (webadmin
// Configure → Scheduling Policies) plus the /schedulingpolicyunits catalog and
// the per-policy filters / weights / balances sub-collections.
//
// Endpoints verified against ovirt-engine-api-model (master):
//   services/SchedulingPoliciesService.java  — GET+POST /schedulingpolicies
//     (Add: mandatory policy.name; optional description, properties[].name/value)
//   services/SchedulingPolicyService.java    — GET/PUT/DELETE /schedulingpolicies/{id},
//     sub-services filters() / weights() / balances()
//   services/FiltersService.java             — GET+POST …/{id}/filters
//     (Add: mandatory filter.scheduling_policy_unit.id), FilterService — DELETE
//   services/WeightsService.java             — GET+POST …/{id}/weights
//     (Add: mandatory weight.scheduling_policy_unit.id; factor attribute rides
//     on types/Weight.java), WeightService — DELETE
//   services/BalancesService.java            — GET+POST …/{id}/balances
//     (Add: mandatory balance.scheduling_policy_unit.id), BalanceService — DELETE
//   services/SchedulingPolicyUnitsService.java — GET /schedulingpolicyunits
//   types/SchedulingPolicy.java   — locked, default_policy, properties (attributes);
//     balances/filters/weights are @Link, so they NEVER ride inline on the policy
//     body — assignments always go through the sub-collections.
//   types/SchedulingPolicyUnit.java — type (PolicyUnitType), internal, enabled,
//     properties. types/PolicyUnitType.java — FILTER, WEIGHT, LOAD_BALANCING.
//   types/Filter.java — position (Integer); types/Weight.java — factor (Integer).
//
// Note: api/resources/clusters.ts keeps its own thin listSchedulingPolicies
// ({ id, name }) for the cluster form's select; this module's richer read model
// is a superset parsed from the same wire data (looseObject passes unknown keys
// through), and both share the ['schedulingPolicies'] query cache.

// ---------------------------------------------------------------------------
// Schemas — engine scalars arrive as JSON strings on live engines, so every
// boolean/number accepts both forms.
// ---------------------------------------------------------------------------

// One scheduling_policy property ({ name, value }). Values are free-form engine
// strings (e.g. CpuOverCommitDurationMinutes=2) but fixtures/live engines may
// serialize numeric-looking values as numbers — coerce to string for a uniform
// read model.
export const PolicyPropertySchema = z.looseObject({
  name: z.string().optional(),
  value: z.coerce.string().optional(),
})

export type PolicyProperty = z.infer<typeof PolicyPropertySchema>

// JSON quirk: the inner "property" key is omitted when the map is empty.
const PropertiesSchema = z.looseObject({
  property: z.array(PolicyPropertySchema).optional(),
})

export const SchedulingPolicySchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  // Built-ins ship locked; the flag arrives as a JSON string on live engines.
  locked: z.union([z.boolean(), z.string()]).optional(),
  default_policy: z.union([z.boolean(), z.string()]).optional(),
  properties: PropertiesSchema.optional(),
})

export const SchedulingPolicyListSchema = z.looseObject({
  scheduling_policy: z.array(SchedulingPolicySchema).optional(),
})

export type SchedulingPolicy = z.infer<typeof SchedulingPolicySchema>

// A policy unit from the GET /schedulingpolicyunits catalog. `type` serializes
// the PolicyUnitType enum lower-case ('filter' | 'weight' | 'load_balancing').
export const SchedulingPolicyUnitSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  internal: z.union([z.boolean(), z.string()]).optional(),
  enabled: z.union([z.boolean(), z.string()]).optional(),
  properties: PropertiesSchema.optional(),
})

export const SchedulingPolicyUnitListSchema = z.looseObject({
  scheduling_policy_unit: z.array(SchedulingPolicyUnitSchema).optional(),
})

export type SchedulingPolicyUnit = z.infer<typeof SchedulingPolicyUnitSchema>

// The bare unit link each assignment carries back to the catalog.
const UnitRefSchema = z.looseObject({ id: z.string(), name: z.string().optional() })

// The engine keys each filter/weight/balance sub-resource by its policy unit's
// id (BackendFiltersResource.updateIncomingId sets id = scheduling_policy_unit
// id), so `id` is both the row identity and the DELETE path segment.
export const PolicyFilterSchema = z.looseObject({
  id: z.string(),
  position: z.coerce.number().optional(),
  scheduling_policy_unit: UnitRefSchema.optional(),
})

export const PolicyFilterListSchema = z.looseObject({
  filter: z.array(PolicyFilterSchema).optional(),
})

export type PolicyFilter = z.infer<typeof PolicyFilterSchema>

export const PolicyWeightSchema = z.looseObject({
  id: z.string(),
  factor: z.coerce.number().optional(),
  scheduling_policy_unit: UnitRefSchema.optional(),
})

export const PolicyWeightListSchema = z.looseObject({
  weight: z.array(PolicyWeightSchema).optional(),
})

export type PolicyWeight = z.infer<typeof PolicyWeightSchema>

export const PolicyBalanceSchema = z.looseObject({
  id: z.string(),
  scheduling_policy_unit: UnitRefSchema.optional(),
})

export const PolicyBalanceListSchema = z.looseObject({
  balance: z.array(PolicyBalanceSchema).optional(),
})

export type PolicyBalance = z.infer<typeof PolicyBalanceSchema>

// ---------------------------------------------------------------------------
// Flag / catalog helpers
// ---------------------------------------------------------------------------

// The engine built-ins (none, evenly_distributed, power_saving, …) ship locked:
// webadmin disables Edit/Remove for them and offers Clone only. Only an
// explicit true/'true' counts (same coercion posture as roles.isMutableRole).
export function isLockedPolicy(policy: SchedulingPolicy): boolean {
  return policy.locked === true || policy.locked === 'true'
}

export function isDefaultPolicy(policy: SchedulingPolicy): boolean {
  return policy.default_policy === true || policy.default_policy === 'true'
}

export type PolicyUnitKind = 'filter' | 'weight' | 'load_balancing'

// Normalize a unit's wire type; unknown/missing types resolve undefined so a
// future PolicyUnitType value degrades to "not offerable" instead of breaking.
export function unitKind(unit: SchedulingPolicyUnit): PolicyUnitKind | undefined {
  const kind = unit.type?.toLowerCase()
  return kind === 'filter' || kind === 'weight' || kind === 'load_balancing' ? kind : undefined
}

export interface PolicyUnitCatalog {
  filters: SchedulingPolicyUnit[]
  weights: SchedulingPolicyUnit[]
  balancers: SchedulingPolicyUnit[]
}

// Group the /schedulingpolicyunits catalog by unit type for the editor's three
// pickers, each sorted by name. Units with an unrecognized type are dropped —
// they can't be assigned through any of the three sub-collections.
export function groupPolicyUnits(units: SchedulingPolicyUnit[]): PolicyUnitCatalog {
  const byName = (a: SchedulingPolicyUnit, b: SchedulingPolicyUnit) =>
    (a.name ?? '').localeCompare(b.name ?? '')
  return {
    filters: units.filter((unit) => unitKind(unit) === 'filter').sort(byName),
    weights: units.filter((unit) => unitKind(unit) === 'weight').sort(byName),
    balancers: units.filter((unit) => unitKind(unit) === 'load_balancing').sort(byName),
  }
}

// Filter chain position. The wire value is an integer (types/Filter.java);
// webadmin renders <0 as "first" and >0 as "last" (ClusterPolicyPopupView) and
// writes exactly -1/1, keeping at most one filter per non-zero position
// (NewClusterPolicyModel.addFilter); 0/absent means unordered
// (SchedulingPolicyMapper defaults the position to 0).
export type FilterPosition = 'none' | 'first' | 'last'

export const FILTER_POSITION_VALUE: Record<FilterPosition, number> = {
  none: 0,
  first: -1,
  last: 1,
}

export function filterPositionOf(position: number | undefined): FilterPosition {
  if (position === undefined || position === 0) return 'none'
  return position < 0 ? 'first' : 'last'
}

// ---------------------------------------------------------------------------
// Editor draft → payloads and assignment diff
//
// The editor holds a flat draft and hands it here to shape REST bodies and to
// diff unit assignments. Centralizing the wire shaping keeps it in one
// testable place (mirror resources/roles.ts RoleDraft).
// ---------------------------------------------------------------------------

export interface PolicyPropertyDraft {
  key: string
  value: string
}

export interface FilterAssignmentDraft {
  unitId: string
  position: FilterPosition
}

export interface WeightAssignmentDraft {
  unitId: string
  factor: number
}

export interface SchedulingPolicyDraft {
  name: string
  description: string
  properties: PolicyPropertyDraft[]
  filters: FilterAssignmentDraft[]
  weights: WeightAssignmentDraft[]
  // The single load balancer (types/SchedulingPolicy holds at most one), or
  // null for none.
  balancerUnitId: string | null
}

// A property row counts only when at least one side has content — a fully
// blank row is editor scaffolding, not a property (mirror macPools
// isRangeFilled).
export function isPropertyFilled(row: PolicyPropertyDraft): boolean {
  return row.key.trim() !== '' || row.value.trim() !== ''
}

// The POST /schedulingpolicies and PUT /schedulingpolicies/{id} body: name,
// description, and the properties map. Filters/weights/balances are @Link on
// types/SchedulingPolicy — they never ride inline; the caller applies them
// through the sub-collections (see diffUnitAssignments).
export function buildPolicyPayload(draft: SchedulingPolicyDraft): Record<string, unknown> {
  const property = draft.properties
    .filter(isPropertyFilled)
    .map((row) => ({ name: row.key.trim(), value: row.value.trim() }))
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    properties: { property },
  }
}

// The unit id an assignment row belongs to. The sub-resource id equals the unit
// id on the engine (see PolicyFilterSchema note); the explicit link wins when
// present, the row id is the documented fallback.
function assignmentUnitId(row: { id: string; scheduling_policy_unit?: { id: string } }): string {
  return row.scheduling_policy_unit?.id ?? row.id
}

export interface CurrentAssignments {
  filters: PolicyFilter[]
  weights: PolicyWeight[]
  balances: PolicyBalance[]
}

export interface UnitAssignmentDiff {
  filtersToAdd: FilterAssignmentDraft[]
  filterIdsToRemove: string[]
  weightsToAdd: WeightAssignmentDraft[]
  weightIdsToRemove: string[]
  balanceUnitIdsToAdd: string[]
  balanceIdsToRemove: string[]
}

export function isEmptyAssignmentDiff(diff: UnitAssignmentDiff): boolean {
  return (
    diff.filtersToAdd.length === 0 &&
    diff.filterIdsToRemove.length === 0 &&
    diff.weightsToAdd.length === 0 &&
    diff.weightIdsToRemove.length === 0 &&
    diff.balanceUnitIdsToAdd.length === 0 &&
    diff.balanceIdsToRemove.length === 0
  )
}

// Diff current vs desired unit assignments for the edit path. Identity is the
// policy unit id; the sub-collections offer no PUT, so a position or factor
// change is a remove + re-add of the same unit. Removes are keyed by the read
// row's own id (the DELETE path segment).
export function diffUnitAssignments(
  current: CurrentAssignments,
  draft: SchedulingPolicyDraft,
): UnitAssignmentDiff {
  const currentFilters = new Map(
    current.filters.map((row) => [assignmentUnitId(row), row] as const),
  )
  const desiredFilters = new Map(draft.filters.map((row) => [row.unitId, row] as const))
  const filtersToAdd = draft.filters.filter((row) => {
    const existing = currentFilters.get(row.unitId)
    return existing === undefined || filterPositionOf(existing.position) !== row.position
  })
  const filterIdsToRemove = current.filters
    .filter((row) => {
      const desired = desiredFilters.get(assignmentUnitId(row))
      return desired === undefined || filterPositionOf(row.position) !== desired.position
    })
    .map((row) => row.id)

  const currentWeights = new Map(
    current.weights.map((row) => [assignmentUnitId(row), row] as const),
  )
  const desiredWeights = new Map(draft.weights.map((row) => [row.unitId, row] as const))
  const weightsToAdd = draft.weights.filter((row) => {
    const existing = currentWeights.get(row.unitId)
    return existing === undefined || (existing.factor ?? 1) !== row.factor
  })
  const weightIdsToRemove = current.weights
    .filter((row) => {
      const desired = desiredWeights.get(assignmentUnitId(row))
      return desired === undefined || (row.factor ?? 1) !== desired.factor
    })
    .map((row) => row.id)

  // At most one balancer: replace = remove the old row(s), add the new unit.
  const currentBalanceUnitIds = current.balances.map(assignmentUnitId)
  const keepBalance =
    draft.balancerUnitId !== null && currentBalanceUnitIds.includes(draft.balancerUnitId)
  const balanceIdsToRemove = current.balances
    .filter((row) => !(keepBalance && assignmentUnitId(row) === draft.balancerUnitId))
    .map((row) => row.id)
  const balanceUnitIdsToAdd =
    draft.balancerUnitId !== null && !keepBalance ? [draft.balancerUnitId] : []

  return {
    filtersToAdd,
    filterIdsToRemove,
    weightsToAdd,
    weightIdsToRemove,
    balanceUnitIdsToAdd,
    balanceIdsToRemove,
  }
}

// ---------------------------------------------------------------------------
// Resource functions
// ---------------------------------------------------------------------------

export async function listSchedulingPolicies(): Promise<SchedulingPolicy[]> {
  const data = SchedulingPolicyListSchema.parse(await request('/schedulingpolicies'))
  return data.scheduling_policy ?? []
}

export async function getSchedulingPolicy(id: string): Promise<SchedulingPolicy> {
  return SchedulingPolicySchema.parse(
    await request(`/schedulingpolicies/${encodeURIComponent(id)}`),
  )
}

// POST /schedulingpolicies — name is mandatory (SchedulingPoliciesService.Add);
// description and the properties map are optional. The engine echoes the
// created policy, parsed for a coerced read model — mirror roles.createRole.
export async function createSchedulingPolicy(
  body: Record<string, unknown>,
): Promise<SchedulingPolicy> {
  return SchedulingPolicySchema.parse(
    await request('/schedulingpolicies', { method: 'POST', body }),
  )
}

// PUT /schedulingpolicies/{id} — name/description/properties only; the engine
// refuses updates to locked (built-in) policies and the fault surfaces
// verbatim via ApiError. Unit assignments go through the sub-collections.
export async function updateSchedulingPolicy(
  id: string,
  body: Record<string, unknown>,
): Promise<SchedulingPolicy> {
  return SchedulingPolicySchema.parse(
    await request(`/schedulingpolicies/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// DELETE /schedulingpolicies/{id} — the engine 409s a locked policy or one
// still attached to a cluster; the fault surfaces verbatim via ApiError.
export async function deleteSchedulingPolicy(id: string): Promise<void> {
  await request(`/schedulingpolicies/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// GET /schedulingpolicyunits — the engine-global policy-unit catalog the
// editor's three pickers are built from.
export async function listSchedulingPolicyUnits(): Promise<SchedulingPolicyUnit[]> {
  const data = SchedulingPolicyUnitListSchema.parse(await request('/schedulingpolicyunits'))
  return data.scheduling_policy_unit ?? []
}

// A 404 on a per-policy sub-collection means "none assigned", not an error
// (project REST hygiene rule for optional subcollections).
async function listSubCollection(policyId: string, sub: string): Promise<unknown> {
  try {
    return await request(`/schedulingpolicies/${encodeURIComponent(policyId)}/${sub}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return {}
    throw error
  }
}

export async function listPolicyFilters(policyId: string): Promise<PolicyFilter[]> {
  const data = PolicyFilterListSchema.parse(await listSubCollection(policyId, 'filters'))
  return data.filter ?? []
}

// POST /schedulingpolicies/{id}/filters — assign one filter unit. Position
// rides only when non-zero (webadmin's posture; the mapper defaults absent to
// 0/unordered).
export async function addPolicyFilter(
  policyId: string,
  assignment: FilterAssignmentDraft,
): Promise<PolicyFilter> {
  const position = FILTER_POSITION_VALUE[assignment.position]
  const body: Record<string, unknown> = {
    scheduling_policy_unit: { id: assignment.unitId },
    ...(position !== 0 ? { position } : {}),
  }
  return PolicyFilterSchema.parse(
    await request(`/schedulingpolicies/${encodeURIComponent(policyId)}/filters`, {
      method: 'POST',
      body,
    }),
  )
}

export async function removePolicyFilter(policyId: string, filterId: string): Promise<void> {
  await request(
    `/schedulingpolicies/${encodeURIComponent(policyId)}/filters/${encodeURIComponent(filterId)}`,
    { method: 'DELETE' },
  )
}

export async function listPolicyWeights(policyId: string): Promise<PolicyWeight[]> {
  const data = PolicyWeightListSchema.parse(await listSubCollection(policyId, 'weights'))
  return data.weight ?? []
}

// POST /schedulingpolicies/{id}/weights — assign one weight unit with its
// multiplication factor (types/Weight.java; webadmin defaults it to 1).
export async function addPolicyWeight(
  policyId: string,
  assignment: WeightAssignmentDraft,
): Promise<PolicyWeight> {
  return PolicyWeightSchema.parse(
    await request(`/schedulingpolicies/${encodeURIComponent(policyId)}/weights`, {
      method: 'POST',
      body: { scheduling_policy_unit: { id: assignment.unitId }, factor: assignment.factor },
    }),
  )
}

export async function removePolicyWeight(policyId: string, weightId: string): Promise<void> {
  await request(
    `/schedulingpolicies/${encodeURIComponent(policyId)}/weights/${encodeURIComponent(weightId)}`,
    { method: 'DELETE' },
  )
}

export async function listPolicyBalances(policyId: string): Promise<PolicyBalance[]> {
  const data = PolicyBalanceListSchema.parse(await listSubCollection(policyId, 'balances'))
  return data.balance ?? []
}

// POST /schedulingpolicies/{id}/balances — set the (single) load balancer.
export async function addPolicyBalance(policyId: string, unitId: string): Promise<PolicyBalance> {
  return PolicyBalanceSchema.parse(
    await request(`/schedulingpolicies/${encodeURIComponent(policyId)}/balances`, {
      method: 'POST',
      body: { scheduling_policy_unit: { id: unitId } },
    }),
  )
}

export async function removePolicyBalance(policyId: string, balanceId: string): Promise<void> {
  await request(
    `/schedulingpolicies/${encodeURIComponent(policyId)}/balances/${encodeURIComponent(balanceId)}`,
    { method: 'DELETE' },
  )
}

// Fetch a policy's three assignment sub-collections together — the editor's
// edit/clone seed and the diff baseline.
export async function listPolicyAssignments(policyId: string): Promise<CurrentAssignments> {
  const [filters, weights, balances] = await Promise.all([
    listPolicyFilters(policyId),
    listPolicyWeights(policyId),
    listPolicyBalances(policyId),
  ])
  return { filters, weights, balances }
}

// Apply an assignment diff: removes first (a re-add of the same unit with a new
// position/factor needs its old row gone; the single balancer slot must be
// vacated before the replacement lands), then adds in parallel.
export async function applyUnitAssignments(
  policyId: string,
  diff: UnitAssignmentDiff,
): Promise<void> {
  await Promise.all([
    ...diff.filterIdsToRemove.map((id) => removePolicyFilter(policyId, id)),
    ...diff.weightIdsToRemove.map((id) => removePolicyWeight(policyId, id)),
    ...diff.balanceIdsToRemove.map((id) => removePolicyBalance(policyId, id)),
  ])
  await Promise.all([
    ...diff.filtersToAdd.map((assignment) => addPolicyFilter(policyId, assignment)),
    ...diff.weightsToAdd.map((assignment) => addPolicyWeight(policyId, assignment)),
    ...diff.balanceUnitIdsToAdd.map((unitId) => addPolicyBalance(policyId, unitId)),
  ])
}
