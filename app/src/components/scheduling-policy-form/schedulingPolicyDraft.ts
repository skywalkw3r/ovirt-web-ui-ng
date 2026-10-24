import {
  filterPositionOf,
  type CurrentAssignments,
  type PolicyPropertyDraft,
  type SchedulingPolicy,
  type SchedulingPolicyDraft,
} from '../../api/resources/schedulingPolicies'

// Editor seeding helpers. The scheduling-policy editor holds a flat
// SchedulingPolicyDraft (see api/resources/schedulingPolicies.ts); these build
// it for the create / edit / clone paths, plus the stable row ids the
// properties editor keys on (mirror mac-pool-form/macPoolDraft.ts).

// A property row carries a stable id for its React key (add/remove must not
// re-key surviving rows) on top of the key/value the payload builder reads.
export interface PolicyPropertyRow extends PolicyPropertyDraft {
  id: string
}

export interface SchedulingPolicyFormDraft extends Omit<SchedulingPolicyDraft, 'properties'> {
  properties: PolicyPropertyRow[]
}

let propertyRowSeq = 0
const nextPropertyId = () => `policy-prop-${propertyRowSeq++}`

export function blankProperty(): PolicyPropertyRow {
  return { id: nextPropertyId(), key: '', value: '' }
}

// Blank create-mode defaults: no metadata, no unit assignments, and no
// property rows (properties are optional — the Add button scaffolds rows).
export function blankDraft(): SchedulingPolicyFormDraft {
  return {
    name: '',
    description: '',
    properties: [],
    filters: [],
    weights: [],
    balancerUnitId: null,
  }
}

// Edit: seed from the policy's read model and its current unit assignments.
// Assignment rows resolve their unit through the inlined link, falling back to
// the row id (the engine keys sub-resources by unit id).
export function policyToDraft(
  policy: SchedulingPolicy,
  assignments: CurrentAssignments,
): SchedulingPolicyFormDraft {
  return {
    name: policy.name ?? '',
    description: policy.description ?? '',
    properties: (policy.properties?.property ?? []).map((row) => ({
      id: nextPropertyId(),
      key: row.name ?? '',
      value: row.value ?? '',
    })),
    filters: assignments.filters.map((row) => ({
      unitId: row.scheduling_policy_unit?.id ?? row.id,
      position: filterPositionOf(row.position),
    })),
    weights: assignments.weights.map((row) => ({
      unitId: row.scheduling_policy_unit?.id ?? row.id,
      factor: row.factor ?? 1,
    })),
    balancerUnitId:
      assignments.balances.length > 0
        ? (assignments.balances[0].scheduling_policy_unit?.id ?? assignments.balances[0].id)
        : null,
  }
}

// Clone: same properties and unit assignments as the source, but a fresh
// "Copy of X" name so the create POST doesn't collide with the original.
export function cloneDraft(
  policy: SchedulingPolicy,
  assignments: CurrentAssignments,
  cloneName: string,
): SchedulingPolicyFormDraft {
  return { ...policyToDraft(policy, assignments), name: cloneName }
}

// Row-shaped form draft → the wire-facing draft the payload builder and the
// assignment diff read (the editor-only property row ids are dropped here).
export function toPayloadDraft(draft: SchedulingPolicyFormDraft): SchedulingPolicyDraft {
  return {
    ...draft,
    properties: draft.properties.map((row) => ({ key: row.key, value: row.value })),
  }
}
