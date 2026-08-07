import { useQuery } from '@tanstack/react-query'
import { getDisk, listDiskPermissions, listDiskVms } from '../api/resources/disks'
import { listStorageDomains } from '../api/resources/storageDomains'
import type { StorageDomain } from '../api/schemas/storage-domain'
import { useSettings } from '../settings/SettingsProvider'

// Disk subcollections drift slowly and only load while the detail page is
// mounted; 60s matches the other admin/parity collections. The constant is a
// floor — the Preferences interval can slow the poll further, never speed it up
// past the VM cadence.
export const DISK_DETAIL_POLL_INTERVAL_MS = 60_000

// Every subcollection hook shares the ['disk', id, <slice>] key prefix so the
// detail page can invalidate a single disk wholesale. They intentionally do not
// gate on isAdmin: the disk detail route already sits behind the DisksPage, and
// the hooks only run once a diskId is in hand.
export function useDisk(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['disk', id],
    queryFn: () => getDisk(id),
    refetchInterval: Math.max(refreshIntervalMs, DISK_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDiskVms(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['disk', id, 'vms'],
    queryFn: () => listDiskVms(id),
    refetchInterval: Math.max(refreshIntervalMs, DISK_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDiskPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['disk', id, 'permissions'],
    queryFn: () => listDiskPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, DISK_DETAIL_POLL_INTERVAL_MS),
  })
}

// The storage domains a disk lives on are not a REST subcollection off the
// disk — they are the global /storagedomains collection narrowed to the ids the
// disk links via its storage_domains follow (getDisk). Mirrors useHostDetail's
// cross-collection tabs (VMs/events): fetch the global list, filter client-side.
// Keyed by the sorted linked ids so a re-link gets its own cache entry, grouped
// under the ['disk', …] prefix for symmetry with the id-keyed slices above.
export function useDiskStorageDomains(linkedIds: string[]) {
  const { refreshIntervalMs } = useSettings()
  const wanted = new Set(linkedIds)
  return useQuery({
    queryKey: ['disk', [...wanted].sort().join(','), 'storageDomains'],
    queryFn: async (): Promise<StorageDomain[]> => {
      const all = await listStorageDomains()
      return all.filter((sd) => wanted.has(sd.id))
    },
    // Only fetch once the disk read has produced at least one linked id.
    enabled: wanted.size > 0,
    refetchInterval: Math.max(refreshIntervalMs, DISK_DETAIL_POLL_INTERVAL_MS),
  })
}
