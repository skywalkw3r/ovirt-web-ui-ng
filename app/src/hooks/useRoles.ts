import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addRolePermit,
  buildRolePayload,
  createRole,
  deleteRole,
  listPermitCatalog,
  listRolePermits,
  listRoles,
  removeRolePermit,
  updateRole,
  type PermitDiff,
  type RoleDraft,
} from '../api/resources/roles'
import { useCapabilities } from '../auth/capabilities'
import { useNotify } from '../notifications/context'
import { useAdminResourcePollInterval } from './useAdminResources'

// The Role read model and the two flag predicates RolesPage renders its rows
// with (administrative vs user account type, mutable vs engine-shipped system
// role), surfaced here so the page consumes them through the hooks layer
// instead of importing api/resources (CLAUDE.md: transport → schemas →
// resources → hooks → pages). RoleSchema lives beside its resource fns, not
// in api/schemas, so the type re-exports from here too.
export { isAdministrativeRole, isMutableRole, type Role } from '../api/resources/roles'

// Query-key builders for the roles catalog. `all` is the list entry (shared
// with usePermissionMutations' role select) and the prefix every role
// mutation invalidates; the permit catalog and per-role permits nest under it.
export const roleKeys = {
  all: ['roles'] as const,
  permitCatalog: ['roles', 'permit-catalog'] as const,
  permits: (roleId: string | undefined) => ['roles', roleId, 'permits'] as const,
}

// The Roles admin page's list query. Shares the ['roles'] cache the Add
// Permission modal's role select already registers (usePermissionMutations),
// so a role created/edited/removed here also refreshes that select. Gated on
// isAdmin (the page renders <NotPermitted> for user-tier accounts and the
// engine would reject the writes anyway); near-static admin inventory, so the
// 60s admin floor applies.
export function useManagedRoles() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: () => listRoles(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// The full permit catalog (SuperUser's permits) the editor's permission tree is
// built from. Fetched only while the editor is open (enabled), then cached for
// the session — the catalog is fixed for a given engine version.
export function usePermitCatalog(enabled: boolean) {
  return useQuery({
    queryKey: roleKeys.permitCatalog,
    queryFn: () => listPermitCatalog(),
    enabled,
    staleTime: Infinity,
  })
}

// A single role's current permits — seeds the editor's checkbox state in edit
// and clone mode. Keyed per role; enabled only while that editor is open.
export function useRolePermits(roleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: roleKeys.permits(roleId),
    queryFn: () => listRolePermits(roleId as string),
    enabled: enabled && roleId !== undefined,
    staleTime: Infinity,
  })
}

// Create (and clone — clone is a create with a pre-filled draft): POST the role
// with its inline permits. ApiError.message carries the engine fault verbatim
// (duplicate name, admin permit on a user role).
export function useCreateRole() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: (roleDraft: RoleDraft) => createRole(buildRolePayload(roleDraft)),
    onSuccess: (role) => {
      notify({ title: `Role ${role.name ?? ''} created`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}

// Edit: PUT the metadata, then apply the permit diff individually
// (add/remove) — the engine has no bulk permit-replace. Metadata goes first so
// an account-type change (User → Admin) lands before any admin permits are
// added. Permit ops run in parallel once metadata succeeds.
export function useUpdateRole() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: async ({
      id,
      metadata,
      diff,
    }: {
      id: string
      metadata: Record<string, unknown>
      diff: PermitDiff
    }) => {
      const role = await updateRole(id, metadata)
      await Promise.all([
        ...diff.toRemove.map((permitId) => removeRolePermit(id, permitId)),
        ...diff.toAdd.map((permitId) => addRolePermit(id, { id: permitId })),
      ])
      return role
    },
    onSuccess: (role) => {
      notify({ title: `Changes to ${role.name ?? ''} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_role, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.all })
      void queryClient.invalidateQueries({ queryKey: roleKeys.permits(id) })
    },
  })
}

// Remove: DELETE the role. A predefined (immutable) role or a role still
// referenced by any permission is rejected with a 409 whose detail surfaces
// verbatim via ApiError. Takes { id, name } so the success toast can name it.
export function useDeleteRole() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({ id }: { id: string; name?: string }) => deleteRole(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Role ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}
