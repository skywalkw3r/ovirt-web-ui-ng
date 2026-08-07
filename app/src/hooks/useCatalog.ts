import { useQuery } from '@tanstack/react-query'
import { listClusters } from '../api/resources/clusters'
import { listTemplates } from '../api/resources/templates'

// Templates and clusters are near-static catalog data: 60s of staleness keeps
// reopening the create wizard from refetching every time, while a long-lived
// session still notices new templates within a minute.
export const CATALOG_STALE_MS = 60_000

// The committed search rides in the query key so each engine-DSL query caches
// separately; no-arg callers (the create wizard) share the '' entry with the
// list-page hooks (useTemplatesList, useClustersInventory) — mirror useEvents.
// follow=tags matches useTemplatesList EXACTLY — shared cache keys demand
// identical queryFns; the embedded tags are harmless to catalog consumers.
export function useTemplates(search = '') {
  return useQuery({
    queryKey: ['templates', search],
    queryFn: () => listTemplates({ search: search || undefined, follow: 'tags' }),
    staleTime: CATALOG_STALE_MS,
  })
}

export function useClusters(search = '') {
  return useQuery({
    queryKey: ['clusters', search],
    queryFn: () => listClusters({ search: search || undefined }),
    staleTime: CATALOG_STALE_MS,
  })
}
