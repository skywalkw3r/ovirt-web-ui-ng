import { useQuery } from '@tanstack/react-query'
import { listStorageDomains } from '../api/resources/storageDomains'
import { useSettings } from '../settings/SettingsProvider'

// Capacity figures drift slowly; 30s keeps them fresh without adding to the
// engine load the 10s VM poll already generates. The constant is a floor —
// the Preferences interval can slow the poll further, never speed it up.
export const STORAGE_DOMAIN_POLL_INTERVAL_MS = 30_000

// Query-key builders for the storage-domain collection. `all` is the bare
// prefix every domain mutation invalidates (it covers each searched list
// entry); `list` the per-search entry useStorageDomains polls; `detail` the
// single-domain read useStorageDomain registers, with the per-domain slices
// nested under it so a domain invalidation reaches them by prefix. Every
// entry mirrors the exact shape its read and invalidations were hand-typing
// before the builders existed (pins in queryKeys.test.ts).
export const storageDomainKeys = {
  all: ['storagedomains'] as const,
  list: (search = '') => ['storagedomains', search] as const,
  detail: (id: string) => ['storagedomain', id] as const,
  disks: (id: string) => ['storagedomain', id, 'disks'] as const,
  vms: (id: string) => ['storagedomain', id, 'vms'] as const,
  templates: (id: string) => ['storagedomain', id, 'templates'] as const,
  permissions: (id: string) => ['storagedomain', id, 'permissions'] as const,
  unregisteredVms: (id: string) => ['storagedomain', id, 'unregistered-vms'] as const,
  unregisteredTemplates: (id: string) => ['storagedomain', id, 'unregistered-templates'] as const,
  unregisteredDisks: (id: string) => ['storagedomain', id, 'unregistered-disks'] as const,
  leases: (id: string) => ['storagedomain', id, 'leases'] as const,
  diskSnapshots: (id: string) => ['storagedomain', id, 'disksnapshots'] as const,
  images: (id: string) => ['storagedomain', id, 'images'] as const,
  diskProfiles: (id: string) => ['storagedomain', id, 'diskprofiles'] as const,
  // The New/Edit Disk modal's profile picker (useStorageDomainDiskProfiles)
  // reads the same /storagedomains/{id}/diskprofiles collection under a
  // SEPARATE flat key — a pre-builder inconsistency with `diskProfiles`
  // above (the Disk Profiles tab's mutations refresh only the tab's entry).
  // Unifying the two is a cache-contract change for a follow-up; both shapes
  // stay verbatim. undefined = no domain picked yet (the query is disabled).
  diskProfilePicker: (id: string | undefined) => ['storage-domain-disk-profiles', id] as const,
}

// GET /storageconnections narrowed to iSCSI — the iSCSI bond editor's
// connection pick-list (IscsiMultipathTab).
export const storageConnectionKeys = {
  iscsi: ['storageConnections', 'iscsi'] as const,
}

// The committed search rides in the query key so each engine-DSL query caches
// (and polls) separately; no-arg callers share the '' entry — mirror useEvents.
export function useStorageDomains(search = '') {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: storageDomainKeys.list(search),
    queryFn: () => listStorageDomains({ search: search || undefined }),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_POLL_INTERVAL_MS),
  })
}
