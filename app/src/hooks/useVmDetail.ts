import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listEvents } from '../api/resources/events'
import { listPermissions, listSystemPermissions } from '../api/resources/permissions'
import {
  listVmAffinityGroups,
  listVmAffinityLabels,
  listVmApplications,
  listVmErrata,
  listVmHostDevices,
  listVmPermissions,
  listVmReportedDevices,
} from '../api/resources/vms'
import { useCapabilities } from '../auth/capabilities'
import { useSettings } from '../settings/SettingsProvider'
import { SYSTEM_PERMISSIONS_KEY } from './useSystemPermissions'

// VM subcollections drift slowly and only load while the detail page is
// mounted; 60s matches the other admin/parity collections. The constant is a
// floor — the Preferences interval can slow the poll further, never speed it
// up past the VM cadence.
export const VM_DETAIL_POLL_INTERVAL_MS = 60_000

// Every subcollection hook shares the ['vm', id, <slice>] key prefix so the
// detail page can invalidate a single VM wholesale. They intentionally do not
// gate on isAdmin: VMs are user-visible, and the hooks only run once a vmId is
// in hand.
export function useVmApplications(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', id, 'applications'],
    queryFn: () => listVmApplications(id),
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useVmHostDevices(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', id, 'hostDevices'],
    queryFn: () => listVmHostDevices(id),
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })
}

// The 'Vm Devices' tab and the Guest Info tab both read the guest-reported
// devices collection; they share one hook (and one cache entry).
export function useVmReportedDevices(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', id, 'reportedDevices'],
    queryFn: () => listVmReportedDevices(id),
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })
}

// Alias kept for the contract's naming: the Vm Devices tab imports
// useVmDevices, which is the same reported-devices query.
export const useVmDevices = useVmReportedDevices

export function useVmAffinityLabels(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', id, 'affinityLabels'],
    queryFn: () => listVmAffinityLabels(id),
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useVmPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', id, 'permissions'],
    queryFn: () => listVmPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })
}

// Ancestor-scope permission ids for a VM: the union of the system permissions
// and the VM's cluster permissions. The cluster's own permission list already
// carries the grants it inherits from its data center and the system (the
// engine rewrites each one's object ref to the cluster), so this single union
// enumerates every grant the VM inherits from above it. A VM permission whose
// id is in this set is inherited, not directly assigned — the Permissions tab
// keys its All/Direct filter off exactly this, because a row from
// /vms/{id}/permissions can't be classified on its own (see isDirectPermission).
//
// Admin-only: the ancestor reads need an admin session, so a user-tier viewer
// gets `undefined` and the tab shows the flat list with no toggle rather than
// one it can't populate. A failed ancestor read simply contributes no ids
// (follow=role, 404-tolerant — the safe permissions-read posture).
export function useVmInheritedPermissionIds(
  clusterId: string | undefined,
): Set<string> | undefined {
  const { isAdmin } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  const refetchInterval = Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS)
  const system = useQuery({
    queryKey: SYSTEM_PERMISSIONS_KEY,
    queryFn: () => listSystemPermissions(),
    enabled: isAdmin,
    refetchInterval,
  })
  const cluster = useQuery({
    queryKey: ['cluster', clusterId, 'permissions'],
    queryFn: () => listPermissions('cluster', clusterId as string),
    enabled: isAdmin && clusterId !== undefined,
    refetchInterval,
  })
  return useMemo(() => {
    if (!isAdmin) return undefined
    const ids = new Set<string>()
    for (const permission of system.data ?? []) {
      if (permission.id !== undefined) ids.add(permission.id)
    }
    for (const permission of cluster.data ?? []) {
      if (permission.id !== undefined) ids.add(permission.id)
    }
    return ids
  }, [isAdmin, system.data, cluster.data])
}

export function useVmErrata(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', id, 'errata'],
    queryFn: () => listVmErrata(id),
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })
}

// Affinity groups live on the cluster, not the VM: the query fetches the
// cluster's groups (vm members followed) and filters to the ones this VM
// belongs to. Disabled until both ids are in hand (a VM without a followed
// cluster has no group membership to show). Keyed by both ids so switching
// either gets its own cache entry.
export function useVmAffinityGroups(clusterId: string | undefined, vmId: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', vmId, 'affinityGroups', clusterId],
    queryFn: () => listVmAffinityGroups(clusterId ?? '', vmId),
    enabled: clusterId !== undefined,
    refetchInterval: Math.max(refreshIntervalMs, VM_DETAIL_POLL_INTERVAL_MS),
  })
}

// The VM's event feed is not a REST subcollection — it is the global /events
// collection narrowed with the engine search DSL (vm.name=<name>). Keyed by VM
// name (what the search filters on) so a rename gets its own cache entry, and
// grouped under the ['vm', name, …] prefix for symmetry with the id-keyed
// slices above.
export function useVmEvents(vmName: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', vmName, 'events'],
    queryFn: () => listEvents({ search: `vm.name=${vmName}` }),
    refetchInterval: refreshIntervalMs,
  })
}
