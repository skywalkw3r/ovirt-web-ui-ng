import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyUnitAssignments,
  buildPolicyPayload,
  createSchedulingPolicy,
  deleteSchedulingPolicy,
  diffUnitAssignments,
  listPolicyAssignments,
  listSchedulingPolicies,
  listSchedulingPolicyUnits,
  updateSchedulingPolicy,
  type CurrentAssignments,
  type SchedulingPolicyDraft,
} from '../../api/resources/schedulingPolicies'
import { useCapabilities } from '../../auth/capabilities'
import { useNotify } from '../../notifications/context'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'

// TanStack Query hooks for the Scheduling Policies admin surface. They live
// beside the form (not in hooks/) because the page + editor are their only
// consumers. The list shares the ['schedulingPolicies'] cache key the cluster
// form's Scheduling Policy select already registers (ClusterFormModal), so a
// policy created/renamed/removed here also refreshes that select — both
// queryFns parse the same wire data through looseObject schemas, this one just
// types the richer read model.

// Near-static admin inventory → the 60s admin poll floor; gated on isAdmin
// (the page renders <NotPermitted> for user-tier accounts, mirror useRoles).
export function useSchedulingPoliciesAdmin() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['schedulingPolicies'],
    queryFn: () => listSchedulingPolicies(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// The /schedulingpolicyunits catalog the editor's pickers are built from.
// Fetched only while the editor is open, then cached for the session — the
// unit catalog is fixed for a given engine version (mirror usePermitCatalog).
export function usePolicyUnitCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ['schedulingPolicyUnits'],
    queryFn: () => listSchedulingPolicyUnits(),
    enabled,
    staleTime: Infinity,
  })
}

// A single policy's current filters/weights/balances — seeds the editor in
// edit and clone mode and is the edit diff's baseline. Keyed per policy;
// enabled only while that editor is open.
export function usePolicyAssignments(policyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['schedulingPolicies', policyId, 'assignments'],
    queryFn: () => listPolicyAssignments(policyId as string),
    enabled: enabled && policyId !== undefined,
    staleTime: Infinity,
  })
}

// Create (and clone — a create with a pre-filled draft): POST the policy
// metadata + properties, then POST each filter/weight/balance assignment
// against the fresh id. A failed assignment leaves the policy created with
// partial units; the fault toast surfaces verbatim and re-opening Edit shows
// the actual state — same partial-failure posture as useUpdateRole's permit
// fan-out.
export function useCreateSchedulingPolicy() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: async (draft: SchedulingPolicyDraft) => {
      const policy = await createSchedulingPolicy(buildPolicyPayload(draft))
      await applyUnitAssignments(
        policy.id,
        diffUnitAssignments({ filters: [], weights: [], balances: [] }, draft),
      )
      return policy
    },
    onSuccess: (policy) => {
      notify({ title: `Scheduling policy ${policy.name ?? ''} created`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedulingPolicies'] })
    },
  })
}

// Edit: PUT the metadata/properties, then apply the assignment diff (removes
// before adds — see applyUnitAssignments). Metadata goes first so a rejected
// rename (locked policy, duplicate name) aborts before any unit churn.
export function useUpdateSchedulingPolicy() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: async ({
      id,
      draft,
      current,
    }: {
      id: string
      draft: SchedulingPolicyDraft
      current: CurrentAssignments
    }) => {
      const policy = await updateSchedulingPolicy(id, buildPolicyPayload(draft))
      await applyUnitAssignments(id, diffUnitAssignments(current, draft))
      return policy
    },
    onSuccess: (policy) => {
      notify({ title: `Changes to ${policy.name ?? ''} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_policy, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['schedulingPolicies'] })
      void queryClient.invalidateQueries({ queryKey: ['schedulingPolicies', id, 'assignments'] })
    },
  })
}

// Remove: DELETE the policy. A locked built-in or a policy still attached to a
// cluster is rejected with a 409 whose detail surfaces verbatim via ApiError.
// Takes { id, name } so the success toast can name it (mirror useDeleteRole).
export function useDeleteSchedulingPolicy() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({ id }: { id: string; name?: string }) => deleteSchedulingPolicy(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Scheduling policy ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedulingPolicies'] })
    },
  })
}
