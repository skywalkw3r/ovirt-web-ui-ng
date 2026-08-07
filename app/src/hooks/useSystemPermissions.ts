import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSystemPermission,
  deleteSystemPermission,
  listSystemPermissions,
  type PermissionSpec,
} from '../api/resources/permissions'
import { useCapabilities } from '../auth/capabilities'
import { useNotify } from '../notifications/context'
import { useAdminResourcePollInterval } from './useAdminResources'

// The data layer for the System Permissions page (webadmin Configure → System
// Permissions). The list is an engine-global admin collection — near-static
// governance data, so it shares the 60s-floor cadence of the other admin
// collections (useAdminResourcePollInterval) and skips the doomed request for
// user-tier accounts (the page renders <NotPermitted> instead). Gating on
// isAdmin alone is safe: it stays false until the profile has loaded. The two
// mutations invalidate ['system-permissions'] so the table refetches after a
// grant/revoke.
//
// Note on the tier: the nav tier itself is derived once at sign-in from this
// same collection (fetchCapabilityProfile), but it lives in AuthProvider React
// state rather than the query cache, so granting/revoking your OWN system admin
// role only re-tiers the session after a fresh sign-in — matching the
// per-object Permissions tabs, which likewise don't live-re-tier.
export const SYSTEM_PERMISSIONS_KEY = ['system-permissions'] as const

export function useSystemPermissions() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: SYSTEM_PERMISSIONS_KEY,
    queryFn: () => listSystemPermissions(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// Display names ride through the mutation variables purely for the toasts —
// the house pattern (useAddPermission carries them the same way). The modal
// resolves them from the selected role/principal rows.
export interface SystemPermissionVars {
  spec: PermissionSpec
  roleName: string
  assigneeName: string
}

// POST /permissions (system scope). Engine-side validation (invalid role,
// principal missing from the DB, a non-SuperUser granting an admin role)
// surfaces via error.message verbatim.
export function useCreateSystemPermission() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ spec }: SystemPermissionVars) => createSystemPermission(spec),
    onSuccess: (_created, { roleName, assigneeName }) => {
      notify({ title: `${roleName} granted to ${assigneeName} on the system`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_PERMISSIONS_KEY })
    },
  })
}

export interface RemoveSystemPermissionVars {
  permissionId: string
  roleName: string
  assigneeName: string
}

// DELETE /permissions/{id}. The engine rejects an inherited grant
// (INHERITED_PERMISSION_CANT_BE_REMOVED) or the last SuperUser permission with
// a 409 whose detail rides error.message for the toast, verbatim.
export function useRemoveSystemPermission() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ permissionId }: RemoveSystemPermissionVars) =>
      deleteSystemPermission(permissionId),
    onSuccess: (_data, { roleName, assigneeName }) => {
      notify({ title: `${roleName} revoked from ${assigneeName}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim — this is
      // where INHERITED_PERMISSION_CANT_BE_REMOVED surfaces to the admin.
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_PERMISSIONS_KEY })
    },
  })
}
