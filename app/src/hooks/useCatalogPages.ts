import { useQuery } from '@tanstack/react-query'
import { listAllDisks } from '../api/resources/disks'
import { listInstanceTypes } from '../api/resources/instanceTypes'
import { listTemplates } from '../api/resources/templates'
import { listVnicProfiles } from '../api/resources/vnicProfiles'
import { useSettings } from '../settings/SettingsProvider'
import { templateKeys } from './useCatalog'

// Catalog list pages watch slow-moving inventory; 30s matches the cadence of
// the other secondary collections (networks, storage domains) without adding
// to the engine load the 10s VM poll already generates. The constant is a
// floor: the user-tunable Preferences interval (useSettings) can slow these
// polls down further, but never drags slow inventory to the VM cadence.
export const CATALOG_PAGE_POLL_INTERVAL_MS = 30_000

// Query-key builders for the three catalog collections this module lists.
// `all` is the bare prefix the mutations invalidate (and, for vNIC profiles,
// the exact unsearched list entry); `list` the per-search entry; `detail` the
// single-entity read the detail hooks register, with their slices nested under
// it. Every entry mirrors the exact shape the reads and invalidations were
// hand-typing before the builders existed (pins in queryKeys.test.ts).
export const vnicProfileKeys = {
  all: ['vnicprofiles'] as const,
  detail: (id: string) => ['vnicprofile', id] as const,
  // the Public Use toggle, the Permissions tab and the permission mutations
  // all share this one entry (the [kind, id, 'permissions'] convention)
  permissions: (id: string) => ['vnicprofile', id, 'permissions'] as const,
  vms: (id: string) => ['vnicprofile', id, 'vms'] as const,
  templates: (id: string) => ['vnicprofile', id, 'templates'] as const,
}

export const instanceTypeKeys = {
  all: ['instancetypes'] as const,
  list: (search = '') => ['instancetypes', search] as const,
  detail: (id: string) => ['instancetype', id] as const,
}

export const diskKeys = {
  all: ['disks'] as const,
  list: (search = '') => ['disks', search] as const,
  detail: (id: string) => ['disk', id] as const,
  vms: (id: string) => ['disk', id, 'vms'] as const,
  permissions: (id: string) => ['disk', id, 'permissions'] as const,
  // useDiskStorageDomains: the global /storagedomains narrowed to the ids the
  // disk links — keyed by the de-duplicated, sorted, comma-joined id list so a
  // re-link gets its own entry (the exact derivation the hook hand-typed)
  storageDomains: (linkedIds: Iterable<string>) =>
    ['disk', [...new Set(linkedIds)].sort().join(','), 'storageDomains'] as const,
  // DiskSnapshotsTab: the disk's snapshots gathered across the storage domains
  // it lives on — the sorted, comma-joined domain ids ride in the key
  snapshots: (id: string, storageDomainIds: readonly string[]) =>
    ['disk', id, 'disksnapshots', [...storageDomainIds].sort().join(',')] as const,
}

function useCatalogPollInterval() {
  const { refreshIntervalMs } = useSettings()
  return Math.max(refreshIntervalMs, CATALOG_PAGE_POLL_INTERVAL_MS)
}

// Shares the ['templates', ''] cache entry with useCatalog's useTemplates
// when unsearched, so visiting the Templates page warms the create wizard's
// source list and vice versa. The committed search rides in the query key so
// each engine-DSL query caches (and polls) separately — mirror useEvents.
// follow=tags matches useCatalog's useTemplates EXACTLY — the two hooks share
// cache keys, so their queryFns must stay identical; the VMs & Templates
// view derives folder membership from the embedded tags.
export function useTemplatesList(search = '') {
  const refetchInterval = useCatalogPollInterval()
  return useQuery({
    queryKey: templateKeys.list(search),
    queryFn: () => listTemplates({ search: search || undefined, follow: 'tags' }),
    refetchInterval,
  })
}

export function useVnicProfiles() {
  const refetchInterval = useCatalogPollInterval()
  return useQuery({
    queryKey: vnicProfileKeys.all,
    queryFn: () => listVnicProfiles(),
    refetchInterval,
  })
}

// Instance types are a compute-catalog config entity (siblings of Templates).
// Search-key rationale as useTemplatesList: the committed engine-DSL search
// rides in the query key so each query caches and polls separately, and no-arg
// callers share the '' entry. /instancetypes supports ?search.
export function useInstanceTypes(search = '') {
  const refetchInterval = useCatalogPollInterval()
  return useQuery({
    queryKey: instanceTypeKeys.list(search),
    queryFn: () => listInstanceTypes({ search: search || undefined }),
    refetchInterval,
  })
}

// Search-key rationale as useTemplatesList; no-arg callers share the '' entry.
export function useAllDisks(search = '') {
  const refetchInterval = useCatalogPollInterval()
  return useQuery({
    queryKey: diskKeys.list(search),
    queryFn: () => listAllDisks({ search: search || undefined }),
    refetchInterval,
  })
}
