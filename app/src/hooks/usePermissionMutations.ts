import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { removePermission, type PermissionEntityKind } from '../api/resources/permissions'
import {
  grantPermissions,
  type GrantBatchResult,
  type GrantTarget,
} from '../api/resources/permissionGrants'
import { listRoles } from '../api/resources/roles'
import { listGroups, listMyGroups, listUsers } from '../api/resources/users'
import { useNotify } from '../notifications/context'
import { groupKeys, userKeys } from './useAdminResources'
import { roleKeys } from './useRoles'

// The permissions data layer for the eight entity Permissions tabs: the Add
// Permission modal's picker queries (roles/users/groups) plus the add/remove
// mutations. The read hooks the tabs already own live in use{Entity}Detail —
// their keys are uniformly [kind, id, 'permissions'], the exact key the
// mutations below invalidate.

// Roles are a near-static catalog (they only change when an admin edits role
// definitions), so cache generously and never poll — reopening the modal
// within the window costs nothing.
export const ROLES_STALE_MS = 5 * 60_000

// The kind-parametrized form of the per-entity permissions key: exactly the
// [kind, id, 'permissions'] entry each entity builder's `permissions` slice
// produces (vmKeys.permissions, clusterKeys.permissions, poolKeys.permissions
// → ['vmpool', …], …; pinned equal for every PermissionEntityKind in
// queryKeys.test.ts). The add/remove mutations below invalidate it, so a grant
// change refetches whichever entity's Permissions tab is mounted.
export const permissionKeys = {
  entity: (kind: PermissionEntityKind, id: string) => [kind, id, 'permissions'] as const,
}

// GET /roles — the Add Permission modal's role select source. Render it
// through assignableRoles() (resources/roles.ts) to drop QuotaConsumer and
// sort; default the selection to USER_ROLE_ID.
export function useRoles() {
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: () => listRoles(),
    staleTime: ROLES_STALE_MS,
  })
}

// Principals (users + groups) drift slowly and their names only feed a
// client-side join (the PermissionsPanel pattern), so the full '' directory
// reads cache for 5 min — same window as the roles catalog above. Without it,
// the Permissions tab on ~10 entity types refetches BOTH list-all reads on
// every tab visit or window refocus, and directory-backed engines return
// thousands of principals.
export const PRINCIPALS_STALE_MS = 5 * 60_000

// Picker queries for the Add Permission modal. Unlike useUsers
// (useAdminResources), these are NOT capability-gated: the VM Permissions tab
// is user-visible by design, and the engine's Filter header scopes/rejects
// server-side. The committed search rides in the key so each term caches
// separately; '' = list all (webadmin's empty-Go semantics). No poll; the
// PRINCIPALS_STALE_MS window keeps a resubmitted search or a remount inside it
// from refetching.
export function usePermissionUsers(search = '') {
  return useQuery({
    // shares the ['users', search] cache entries useUsers registers
    queryKey: userKeys.list(search),
    queryFn: () => listUsers({ search: search || undefined }),
    staleTime: PRINCIPALS_STALE_MS,
  })
}

export function useGroups(search = '') {
  return useQuery({
    queryKey: groupKeys.list(search),
    queryFn: () => listGroups({ search: search || undefined }),
    staleTime: PRINCIPALS_STALE_MS,
  })
}

// GET /users/{me}/groups — the "My Groups" source (listMyGroups). Only read
// while that radio is picked; memberships change rarely, so it shares the
// principal-cache window. Its own key (not under ['groups', search], where a
// search term could collide with it).
export const MY_GROUPS_KEY = ['my-groups'] as const

export function useMyGroups(enabled: boolean) {
  return useQuery({
    queryKey: MY_GROUPS_KEY,
    queryFn: () => listMyGroups(),
    staleTime: PRINCIPALS_STALE_MS,
    enabled,
  })
}

export interface GrantPermissionsVars {
  roleId: string
  targets: GrantTarget[]
}

// The Add Permission dialog's batch grant (permissionGrants.grantPermissions):
// one POST per principal, directory principals materialized first. Resolves
// with the per-target outcome — partial failure is a result, not a thrown
// error, so the dialog can keep the failed picks for a retry. The full DB
// inventories a directory row is matched against come from the query cache
// (the PermissionsPanel name join already reads them), and the invalidations
// refresh the entity's grants plus, when something was materialized, the
// user/group inventories.
export function useGrantPermissions(entityKind: PermissionEntityKind, entityId: string) {
  const queryClient = useQueryClient()

  return useMutation<GrantBatchResult, Error, GrantPermissionsVars>({
    mutationFn: ({ roleId, targets }) =>
      grantPermissions(entityKind, entityId, roleId, targets, {
        users: () =>
          queryClient.fetchQuery({
            queryKey: userKeys.list(''),
            queryFn: () => listUsers(),
            staleTime: PRINCIPALS_STALE_MS,
          }),
        groups: () =>
          queryClient.fetchQuery({
            queryKey: groupKeys.list(''),
            queryFn: () => listGroups(),
            staleTime: PRINCIPALS_STALE_MS,
          }),
      }),
    onSettled: (result) => {
      void queryClient.invalidateQueries({ queryKey: permissionKeys.entity(entityKind, entityId) })
      if (result !== undefined && result.materialized > 0) {
        void queryClient.invalidateQueries({ queryKey: userKeys.all })
        void queryClient.invalidateQueries({ queryKey: groupKeys.all })
      }
    },
  })
}

// Display names ride through the mutation variables purely for the toasts —
// the house pattern (useDeleteCluster carries `name` the same way). The
// caller resolves them from the selected permission row.
export interface RemovePermissionVars {
  permissionId: string
  roleName: string
  assigneeName: string
}

// DELETE /{collection}/{id}/permissions/{permissionId}. REST limitation: the
// nested GET merges inherited grants with their object ids rewritten to this
// entity (BackendAssignedPermissionsResource.list), so the UI cannot gray out
// inherited rows the way webadmin does — the engine's own guards (last
// SuperUser 409, admin-role removal, inherited-via-/users) are the safety net
// and land here as error.message for the toast.
export function useRemovePermission(entityKind: PermissionEntityKind, entityId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ permissionId }: RemovePermissionVars) =>
      removePermission(entityKind, entityId, permissionId),
    onSuccess: (_data, { roleName, assigneeName }) => {
      notify({ title: `${roleName} revoked from ${assigneeName}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: permissionKeys.entity(entityKind, entityId) })
    },
  })
}
