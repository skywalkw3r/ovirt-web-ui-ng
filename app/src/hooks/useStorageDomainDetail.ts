import { useQuery } from '@tanstack/react-query'
import {
  getStorageDomain,
  listStorageDomainDisks,
  listStorageDomainPermissions,
  listStorageDomainTemplates,
  listStorageDomainVms,
  listUnregisteredStorageDomainTemplates,
  listUnregisteredStorageDomainVms,
} from '../api/resources/storageDomains'
import { useSettings } from '../settings/SettingsProvider'

// Storage domain subcollections drift slowly and only load while the detail
// page is mounted; 60s matches the other admin/parity collections. The
// constant is a floor — the Preferences interval can slow the poll further,
// never speed it up past the VM cadence.
export const STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS = 60_000

// Every hook shares the ['storagedomain', id, …] key prefix so the detail page
// can invalidate a single domain wholesale. They intentionally do not gate on
// isAdmin: the storage domain detail route already sits behind the
// StorageDomainsPage, and the hooks only run once a storageDomainId is in hand.
export function useStorageDomain(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id],
    queryFn: () => getStorageDomain(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useStorageDomainDisks(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'disks'],
    queryFn: () => listStorageDomainDisks(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useStorageDomainVms(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'vms'],
    queryFn: () => listStorageDomainVms(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useStorageDomainTemplates(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'templates'],
    queryFn: () => listStorageDomainTemplates(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useStorageDomainPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'permissions'],
    queryFn: () => listStorageDomainPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

// The unregistered VMs sitting in a data domain's OVF store, feeding the
// "Register VMs" subtab. Same 60s floor and ['storagedomain', id, …] prefix as
// the sibling subcollections so the detail page's wholesale invalidate refreshes
// it too. Registering one drops it from this list (the resource removes it from
// the OVF store), so the register mutation invalidates this key.
export function useUnregisteredStorageDomainVms(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'unregistered-vms'],
    queryFn: () => listUnregisteredStorageDomainVms(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

// The unregistered templates in a data domain's OVF store, feeding the
// "Register Templates" subtab. Sibling of useUnregisteredStorageDomainVms.
export function useUnregisteredStorageDomainTemplates(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'unregistered-templates'],
    queryFn: () => listUnregisteredStorageDomainTemplates(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}
