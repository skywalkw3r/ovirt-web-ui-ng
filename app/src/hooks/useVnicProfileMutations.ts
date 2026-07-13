import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVnicProfile,
  deleteVnicProfile,
  updateVnicProfile,
} from '../api/resources/vnicProfiles'
import {
  grantPublicUse,
  isPublicUseGranted,
  listPermissions,
  revokePublicUse,
} from '../api/resources/permissions'
import { useNotify } from '../notifications/context'

// The TanStack Query key the Public Use read registers, shared by the read hook
// and the mutation's invalidation. Matches the permissions convention
// [kind, id, 'permissions'] so it never collides with the profile list key.
export function vnicProfilePermissionsKey(profileId: string) {
  return ['vnicprofile', profileId, 'permissions'] as const
}

// The Create vNIC Profile modal's save mutation. Mirrors useCreateNetwork:
// notify on success/failure and invalidate the profile list query so the
// refetch shows the new one. The list key is ['vnicprofiles'] — the key
// useVnicProfiles registers.
export function useCreateVnicProfile() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createVnicProfile(payload),
    onSuccess: (profile) => {
      notify({ title: `vNIC profile ${profile.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vnicprofiles'] })
    },
  })
}

// The Edit vNIC Profile modal's save mutation. Mirrors useUpdateNetwork: notify
// on success/failure and invalidate the profile list query so the refetch shows
// the edit. The list key is ['vnicprofiles'] — the key useVnicProfiles registers.
export function useUpdateVnicProfile() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateVnicProfile(id, payload),
    onSuccess: (profile) => {
      notify({ title: `Changes to ${profile.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vnicprofiles'] })
    },
  })
}

// The Remove vNIC Profile mutation. Mirrors useDeleteNetwork: notify on
// success/failure and invalidate the profile list query so the refetch drops
// the removed one. Takes { id, name } so the success toast can name the profile.
// The engine rejects an in-use profile with 409 (VNIC_PROFILE_IN_USE); that
// fault surfaces verbatim through error.message. The list key is ['vnicprofiles']
// — the key useVnicProfiles registers.
export function useDeleteVnicProfile() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteVnicProfile(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `vNIC profile ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vnicprofiles'] })
    },
  })
}

// Reads the profile's "Public Use" state — webadmin's "Allow all users to use
// this profile". It is NOT a vnic_profile field: it is the VnicProfileUser role
// granted to the built-in Everyone group on /vnicprofiles/{id}/permissions. The
// query loads the profile's grants (404-tolerant → []) and reports whether that
// specific grant is present. `enabled` gates the read to the edit modal's open
// window (create has no id yet). `granted` is undefined until the read resolves
// so the modal can tell "not loaded yet" from a real "off".
export function useVnicProfilePublicUse(profileId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: vnicProfilePermissionsKey(profileId ?? ''),
    queryFn: () => listPermissions('vnicprofile', profileId as string),
    enabled: enabled && profileId !== undefined,
  })
  return {
    ...query,
    granted: query.data === undefined ? undefined : isPublicUseGranted(query.data),
  }
}

// Flips Public Use on a profile. Grant adds the Everyone/VnicProfileUser
// permission; revoke deletes it — but DELETE needs the grant's engine-assigned
// permission id, so the caller passes the current permissions list and this
// resolves the id from it (no-ops if the grant is somehow already gone). The
// permissions read is invalidated so the toggle reflects the new state, and it
// is deliberately separate from the profile create/edit PUT: the switch drives
// its own request, not a field on the profile body.
export function useToggleVnicProfilePublicUse() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: async ({
      profileId,
      next,
      permissions,
    }: {
      profileId: string
      next: boolean
      permissions: Awaited<ReturnType<typeof listPermissions>>
    }) => {
      if (next) {
        await grantPublicUse(profileId)
        return
      }
      const grant = permissions.find((permission) => isPublicUseGranted([permission]))
      if (grant?.id !== undefined) await revokePublicUse(profileId, grant.id)
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { profileId }) => {
      void queryClient.invalidateQueries({
        queryKey: vnicProfilePermissionsKey(profileId),
      })
    },
  })
}
