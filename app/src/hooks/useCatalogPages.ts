import { useQuery } from '@tanstack/react-query'
import { listAllDisks } from '../api/resources/disks'
import { listInstanceTypes } from '../api/resources/instanceTypes'
import { listTemplates } from '../api/resources/templates'
import { listVnicProfiles } from '../api/resources/vnicProfiles'
import { useSettings } from '../settings/SettingsProvider'

// Catalog list pages watch slow-moving inventory; 30s matches the cadence of
// the other secondary collections (networks, storage domains) without adding
// to the engine load the 10s VM poll already generates. The constant is a
// floor: the user-tunable Preferences interval (useSettings) can slow these
// polls down further, but never drags slow inventory to the VM cadence.
export const CATALOG_PAGE_POLL_INTERVAL_MS = 30_000

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
    queryKey: ['templates', search],
    queryFn: () => listTemplates({ search: search || undefined, follow: 'tags' }),
    refetchInterval,
  })
}

export function useVnicProfiles() {
  const refetchInterval = useCatalogPollInterval()
  return useQuery({
    queryKey: ['vnicprofiles'],
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
    queryKey: ['instancetypes', search],
    queryFn: () => listInstanceTypes({ search: search || undefined }),
    refetchInterval,
  })
}

// Search-key rationale as useTemplatesList; no-arg callers share the '' entry.
export function useAllDisks(search = '') {
  const refetchInterval = useCatalogPollInterval()
  return useQuery({
    queryKey: ['disks', search],
    queryFn: () => listAllDisks({ search: search || undefined }),
    refetchInterval,
  })
}
