import { useQuery } from '@tanstack/react-query'
import { listClusters } from '../api/resources/clusters'
import { listTemplates } from '../api/resources/templates'
import { listOperatingSystems } from '../api/resources/vms'
import { clusterKeys } from './useAdminResources'

// Templates and clusters are near-static catalog data: 60s of staleness keeps
// reopening the create wizard from refetching every time, while a long-lived
// session still notices new templates within a minute.
export const CATALOG_STALE_MS = 60_000

// Query-key builders for the template catalog (clusterKeys lives with the
// other inventory builders in useAdminResources). `all` is the bare prefix the
// template mutations invalidate; `list` the per-search entry useTemplates and
// useTemplatesList share; `detail` the single-template read useTemplateDetail
// registers.
export const templateKeys = {
  all: ['templates'] as const,
  list: (search = '') => ['templates', search] as const,
  detail: (id: string) => ['template', id] as const,
  // the per-template slices useTemplateDetail / useTemplateTags register,
  // nested under the detail prefix so a template invalidation reaches them
  nics: (id: string) => ['template', id, 'nics'] as const,
  diskAttachments: (id: string) => ['template', id, 'diskAttachments'] as const,
  permissions: (id: string) => ['template', id, 'permissions'] as const,
  tags: (id: string) => ['template', id, 'tags'] as const,
  // the template's VMs are the global /vms narrowed by template.name= — keyed
  // by NAME (useTemplateVms)
  vms: (name: string) => ['template', name, 'vms'] as const,
}

// GET /operatingsystems — the engine's OS catalog, fixed for a given engine
// version. Keyed ['operatingSystems'], the entry the Edit VM and template
// forms' Operating System selects share.
export const operatingSystemKeys = {
  all: ['operatingSystems'] as const,
}

// GET /icons (+ /icons/{id}) — the VM icon catalog the Edit VM Icon section
// reads; `detail` is its direct-preview fallback for an icon the catalog
// listing carries without inline data.
export const iconKeys = {
  all: ['icons'] as const,
  detail: (id: string) => ['icon', id] as const,
}

// The committed search rides in the query key so each engine-DSL query caches
// separately; no-arg callers (the create wizard) share the '' entry with the
// list-page hooks (useTemplatesList, useClustersInventory) — mirror useEvents.
// follow=tags matches useTemplatesList EXACTLY — shared cache keys demand
// identical queryFns; the embedded tags are harmless to catalog consumers.
// `enabled` lets a dialog defer the read until it is actually open (a modal
// mounted closed, an edit form that never shows the picker) while still
// sharing the list entry — and its exact queryFn — with every other observer.
export function useTemplates(search = '', options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: templateKeys.list(search),
    queryFn: () => listTemplates({ search: search || undefined, follow: 'tags' }),
    staleTime: CATALOG_STALE_MS,
    enabled: options.enabled,
  })
}

export function useClusters(search = '', options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: clusterKeys.list(search),
    queryFn: () => listClusters({ search: search || undefined }),
    staleTime: CATALOG_STALE_MS,
    enabled: options.enabled,
  })
}

// The OS catalog for the Edit VM General section's Operating System select.
// Engine-static, so it shares the catalog staleness; the catalog is small and
// the modal is the only observer, so no poll.
export function useOperatingSystems() {
  return useQuery({
    queryKey: operatingSystemKeys.all,
    queryFn: () => listOperatingSystems(),
    staleTime: CATALOG_STALE_MS,
  })
}
