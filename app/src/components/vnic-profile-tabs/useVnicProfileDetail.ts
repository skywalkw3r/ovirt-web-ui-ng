import { useQuery } from '@tanstack/react-query'
import { listPermissions } from '../../api/resources/permissions'
import {
  getVnicProfile,
  listVnicProfileTemplates,
  listVnicProfileVms,
} from '../../api/resources/vnicProfiles'
import { vnicProfilePermissionsKey } from '../../hooks/useVnicProfileMutations'
import { useSettings } from '../../settings/SettingsProvider'

// vNIC profiles are infrastructure entities that drift slowly and only load
// while the detail page is mounted; 60s matches the other admin/parity
// collections. The constant is a floor — the Preferences interval can slow the
// poll further, never speed it up past the VM cadence (admin/parity rule).
export const VNIC_PROFILE_DETAIL_POLL_INTERVAL_MS = 60_000

// The profile record itself. Keyed ['vnicprofile', id] so it sits under the same
// prefix as the ['vnicprofile', id, 'permissions'] read the Public Use toggle
// and the Permissions tab share.
export function useVnicProfile(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vnicprofile', id],
    queryFn: () => getVnicProfile(id),
    refetchInterval: Math.max(refreshIntervalMs, VNIC_PROFILE_DETAIL_POLL_INTERVAL_MS),
  })
}

// The grants on the profile — the same read the Public Use toggle uses, so it
// reuses vnicProfilePermissionsKey (['vnicprofile', id, 'permissions']). That
// key is exactly what the PermissionsPanel's add/remove mutations invalidate, so
// a grant change refetches this list, and the tab and the edit modal's toggle
// never disagree. listPermissions tolerates the 404 an ungranted profile answers
// as the empty list (the panel's empty state).
export function useVnicProfilePermissionsList(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: vnicProfilePermissionsKey(id),
    queryFn: () => listPermissions('vnicprofile', id),
    refetchInterval: Math.max(refreshIntervalMs, VNIC_PROFILE_DETAIL_POLL_INTERVAL_MS),
  })
}

// VMs with a vNIC bound to the profile — a client-side join over GET
// /vms?follow=nics (see resources/vnicProfiles.ts). Shares the ['vnicprofile',
// id, …] prefix. It does NOT poll: the join pulls the ENTIRE /vms collection with
// follow=nics, and membership drifts slowly (H-6 engine-load finding). 5min
// staleTime lets a tab revisit reuse the cache; the toolbar RefreshControl still
// invalidates every query, so a manual refresh refetches on demand.
export function useVnicProfileVms(id: string) {
  return useQuery({
    queryKey: ['vnicprofile', id, 'vms'],
    queryFn: () => listVnicProfileVms(id),
    refetchInterval: false,
    staleTime: 5 * 60_000,
  })
}

// Templates with a vNIC bound to the profile — the same client-side join as the
// VMs read, over GET /templates?follow=nics (see resources/vnicProfiles.ts), and
// de-polled for the same reason.
export function useVnicProfileTemplates(id: string) {
  return useQuery({
    queryKey: ['vnicprofile', id, 'templates'],
    queryFn: () => listVnicProfileTemplates(id),
    refetchInterval: false,
    staleTime: 5 * 60_000,
  })
}
