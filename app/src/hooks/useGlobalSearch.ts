import { useEffect, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { useNavigate } from '@tanstack/react-router'
import { useCapabilities } from '../auth/capabilities'
import { parseSearchInput, type SearchScope } from '../lib/search-query'
import { listVms } from '../api/resources/vms'
import { listTemplates } from '../api/resources/templates'
import { listHosts } from '../api/resources/hosts'
import { listClusters } from '../api/resources/clusters'
import { listStorageDomains } from '../api/resources/storageDomains'
import { listNetworks } from '../api/resources/networks'
import { listDataCenters } from '../api/resources/datacenters'
import { statusLabel } from '../lib/vm-status'
import type { MessageId } from '../i18n/messages/en'

// Global-search fan-out (docs/GLOBAL-SEARCH.md §5): one engine ?search= query
// per collection, in parallel, merged into type-grouped preview slices. oVirt
// has no unified search endpoint — the per-collection DSL is the index.

// Lighter than useVmSearch's 400ms: these are cheap name-prefix reads and the
// preview should feel live.
export const GLOBAL_SEARCH_DEBOUNCE_MS = 250
// Don't fan out on a single character — too broad to be a useful preview.
export const GLOBAL_SEARCH_MIN_CHARS = 2
// Preview slice per group; the group's list page (via "Show all") is the
// full-results surface.
export const GLOBAL_SEARCH_PREVIEW_LIMIT = 5

type NavigateFn = ReturnType<typeof useNavigate>

export interface SearchHit {
  id: string
  name: string
  // one line of row context (status · cluster, description, …); plain text —
  // the palette renders it as a muted meta span
  meta?: string
}

export interface SearchGroup {
  key: SearchScope
  labelId: MessageId
  status: 'pending' | 'error' | 'success'
  // engine matches (pre-cap) so the palette can say "Show all N"
  total: number
  items: SearchHit[]
  // open one hit's detail page / the group's filtered list page — literal
  // routes live in the def so navigation stays fully typed, no string casts
  open: (navigate: NavigateFn, id: string) => void
  showAll: (navigate: NavigateFn) => void
}

interface GroupDef {
  key: SearchScope
  labelId: MessageId
  // mirrors AppShell's sidebar gating: never query a collection the engine
  // would answer with a permission fault (transport's Filter header is the
  // real enforcement — this only avoids guaranteed failures)
  adminOnly?: boolean
  fetch: (clause: string, signal: AbortSignal) => Promise<SearchHit[]>
  open: (navigate: NavigateFn, id: string) => void
  // "Show all" lands on the existing list page with the clause committed to
  // its ?q= param (the useListSearch/useVmSearch convention), so the full
  // results view is the page the user already knows
  showAll: (navigate: NavigateFn, clause: string) => void
}

// Row-context joiner: skip absent parts, keep the separator consistent.
const meta = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' · ')

const GROUP_DEFS: readonly GroupDef[] = [
  {
    key: 'vms',
    labelId: 'search.group.vms',
    fetch: async (clause, signal) =>
      (await listVms({ search: clause, signal })).map((vm) => ({
        id: vm.id,
        name: vm.name,
        meta: meta(statusLabel(vm.status), vm.cluster?.name),
      })),
    open: (navigate, id) => void navigate({ to: '/vms/$vmId', params: { vmId: id } }),
    showAll: (navigate, clause) => void navigate({ to: '/vms', search: { q: clause } }),
  },
  {
    key: 'templates',
    labelId: 'search.group.templates',
    fetch: async (clause, signal) =>
      (await listTemplates({ search: clause, signal })).map((template) => ({
        id: template.id,
        name: template.name,
        meta: meta(template.description),
      })),
    open: (navigate, id) =>
      void navigate({ to: '/templates/$templateId', params: { templateId: id } }),
    showAll: (navigate, clause) => void navigate({ to: '/templates', search: { q: clause } }),
  },
  {
    key: 'hosts',
    labelId: 'search.group.hosts',
    adminOnly: true,
    fetch: async (clause, signal) =>
      (await listHosts({ search: clause, signal })).map((host) => ({
        id: host.id,
        name: host.name,
        meta: meta(host.status, host.cluster?.name),
      })),
    open: (navigate, id) => void navigate({ to: '/hosts/$hostId', params: { hostId: id } }),
    showAll: (navigate, clause) => void navigate({ to: '/hosts', search: { q: clause } }),
  },
  {
    key: 'clusters',
    labelId: 'search.group.clusters',
    adminOnly: true,
    fetch: async (clause, signal) =>
      (await listClusters({ search: clause, signal })).map((cluster) => ({
        id: cluster.id,
        name: cluster.name,
        meta: meta(cluster.description),
      })),
    open: (navigate, id) =>
      void navigate({ to: '/clusters/$clusterId', params: { clusterId: id } }),
    showAll: (navigate, clause) => void navigate({ to: '/clusters', search: { q: clause } }),
  },
  {
    key: 'storageDomains',
    labelId: 'search.group.storageDomains',
    adminOnly: true,
    fetch: async (clause, signal) =>
      (await listStorageDomains({ search: clause, signal })).map((domain) => ({
        id: domain.id,
        name: domain.name,
        meta: meta(domain.type, domain.status ?? domain.external_status),
      })),
    open: (navigate, id) =>
      void navigate({ to: '/storage/$storageDomainId', params: { storageDomainId: id } }),
    showAll: (navigate, clause) => void navigate({ to: '/storage', search: { q: clause } }),
  },
  {
    key: 'networks',
    labelId: 'search.group.networks',
    fetch: async (clause, signal) =>
      (await listNetworks({ search: clause, signal })).map((network) => ({
        id: network.id,
        name: network.name,
        meta: meta(network.description, network.status),
      })),
    open: (navigate, id) =>
      void navigate({ to: '/networks/$networkId', params: { networkId: id } }),
    showAll: (navigate, clause) => void navigate({ to: '/networks', search: { q: clause } }),
  },
  {
    key: 'dataCenters',
    labelId: 'search.group.dataCenters',
    adminOnly: true,
    fetch: async (clause, signal) =>
      (await listDataCenters({ search: clause, signal })).map((dc) => ({
        id: dc.id,
        name: dc.name,
        meta: meta(dc.status, dc.description),
      })),
    open: (navigate, id) =>
      void navigate({ to: '/datacenters/$dataCenterId', params: { dataCenterId: id } }),
    showAll: (navigate, clause) => void navigate({ to: '/datacenters', search: { q: clause } }),
  },
]

export function useGlobalSearch(rawTerm: string): {
  // true once the input is long enough that groups are being fetched
  active: boolean
  groups: SearchGroup[]
} {
  const { isAdmin } = useCapabilities()

  // Debounce the raw input; clearing (below min-length) applies immediately so
  // emptying the box snaps back to the idle palette without a trailing fetch.
  const [debounced, setDebounced] = useState(rawTerm)
  useEffect(() => {
    if (rawTerm.trim().length < GLOBAL_SEARCH_MIN_CHARS) {
      setDebounced(rawTerm)
      return
    }
    const timer = setTimeout(() => setDebounced(rawTerm), GLOBAL_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [rawTerm])

  const { scope, clause } = parseSearchInput(debounced)
  const active = clause !== null && debounced.trim().length >= GLOBAL_SEARCH_MIN_CHARS

  // A def is queried when the tier can reach it and the (optional) vm:/host:
  // type scope includes it. useQueries keeps the array shape stable — skipped
  // defs simply stay disabled.
  const included = (def: GroupDef) =>
    (isAdmin || !def.adminOnly) && (scope === null || scope === def.key)

  const queries = useQueries({
    queries: GROUP_DEFS.map((def) => ({
      // per-collection key: each term caches independently, repeat terms are
      // instant, and one group's failure never touches its siblings
      queryKey: ['global-search', def.key, clause],
      queryFn: ({ signal }: { signal: AbortSignal }) => def.fetch(clause ?? '', signal),
      enabled: active && included(def),
      // preview freshness only — reopening the palette on the same term
      // shouldn't refetch, but nothing here needs poll-grade currency
      staleTime: 30_000,
      retry: false,
    })),
  })

  if (!active) return { active: false, groups: [] }

  const groups: SearchGroup[] = []
  GROUP_DEFS.forEach((def, index) => {
    if (!included(def)) return
    const query = queries[index]
    const hits = query.data ?? []
    groups.push({
      key: def.key,
      labelId: def.labelId,
      status: query.isError ? 'error' : query.isPending ? 'pending' : 'success',
      total: hits.length,
      items: hits.slice(0, GLOBAL_SEARCH_PREVIEW_LIMIT),
      open: def.open,
      showAll: (navigate) => def.showAll(navigate, clause ?? ''),
    })
  })
  return { active: true, groups }
}
