import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPermission,
  removePermission,
  type PermissionEntityKind,
  type PermissionSpec,
} from '../api/resources/permissions'
import { listRoles } from '../api/resources/roles'
import { listGroups, listUsers } from '../api/resources/users'
import { useNotify } from '../notifications/context'

// The permissions data layer for the eight entity Permissions tabs: the Add
// Permission modal's picker queries (roles/users/groups) plus the add/remove
// mutations. The read hooks the tabs already own live in use{Entity}Detail —
// their keys are uniformly [kind, id, 'permissions'], the exact key the
// mutations below invalidate.

// Roles are a near-static catalog (they only change when an admin edits role
// definitions), so cache generously and never poll — reopening the modal
// within the window costs nothing.
export const ROLES_STALE_MS = 5 * 60_000

// GET /roles — the Add Permission modal's role select source. Render it
// through assignableRoles() (resources/roles.ts) to drop QuotaConsumer and
// sort; default the selection to USER_ROLE_ID.
export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles(),
    staleTime: ROLES_STALE_MS,
  })
}

// Picker queries for the Add Permission modal. Unlike useUsers
// (useAdminResources), these are NOT capability-gated: the VM Permissions tab
// is user-visible by design, and the engine's Filter header scopes/rejects
// server-side. The committed search rides in the key so each term caches
// separately; '' = list all (webadmin's empty-Go semantics). No poll — the
// results refresh when the search resubmits or the modal remounts.
export function usePermissionUsers(search = '') {
  return useQuery({
    // shares the ['users', search] cache entries useUsers registers
    queryKey: ['users', search],
    queryFn: () => listUsers({ search: search || undefined }),
  })
}

export function useGroups(search = '') {
  return useQuery({
    queryKey: ['groups', search],
    queryFn: () => listGroups({ search: search || undefined }),
  })
}

// Display names ride through the mutation variables purely for the toasts —
// the house pattern (useDeleteCluster carries `name` the same way). The
// caller resolves them from the selected role/principal rows.
export interface AddPermissionVars {
  spec: PermissionSpec
  roleName: string
  assigneeName: string
}

// POST /{collection}/{id}/permissions. Engine-side validation (invalid role,
// principal missing from the DB, non-SuperUser granting an admin role, pool
// VM UserRole) surfaces via error.message verbatim.
export function useAddPermission(entityKind: PermissionEntityKind, entityId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ spec }: AddPermissionVars) => addPermission(entityKind, entityId, spec),
    onSuccess: (_created, { roleName, assigneeName }) => {
      notify({ title: `${roleName} granted to ${assigneeName}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [entityKind, entityId, 'permissions'] })
    },
  })
}

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
      void queryClient.invalidateQueries({ queryKey: [entityKind, entityId, 'permissions'] })
    },
  })
}
