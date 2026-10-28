import { useQuery } from '@tanstack/react-query'
import { listNetworks } from '../api/resources/networks'
import { useSettings } from '../settings/SettingsProvider'

// Networks change rarely compared to VM state, so a slower cadence is enough.
// The constant is a floor — the Preferences interval can slow the poll
// further, never speed it up.
export const NETWORK_POLL_INTERVAL_MS = 30_000

// Query-key builders for the logical-network collection. `all` is the bare
// prefix every network mutation (and the two external-network imports)
// invalidates; `list` the per-search entry useNetworks polls; `detail` the
// single-network read useNetwork registers, with the per-network slices
// (useNetworkDetail, the membership joins in components/network-tabs) nested
// under it. Every entry mirrors the exact shape its read and invalidations
// were hand-typing before the builders existed (pins in queryKeys.test.ts).
export const networkKeys = {
  all: ['networks'] as const,
  list: (search = '') => ['networks', search] as const,
  detail: (id: string) => ['network', id] as const,
  vnicProfiles: (id: string) => ['network', id, 'vnicProfiles'] as const,
  labels: (id: string) => ['network', id, 'labels'] as const,
  permissions: (id: string) => ['network', id, 'permissions'] as const,
  clusters: (id: string) => ['network', id, 'clusters'] as const,
  hosts: (id: string) => ['network', id, 'hosts'] as const,
  vms: (id: string) => ['network', id, 'vms'] as const,
  templates: (id: string) => ['network', id, 'templates'] as const,
}

// GET /networkfilters — the engine's static vNIC network-filter catalog the
// vNIC profile form's Network Filter select reads.
export const networkFilterKeys = {
  all: ['networkfilters'] as const,
}

// The committed search rides in the query key so each engine-DSL query caches
// (and polls) separately; no-arg callers share the '' entry — mirror useEvents.
export function useNetworks(search = '') {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: networkKeys.list(search),
    queryFn: () => listNetworks({ search: search || undefined }),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_POLL_INTERVAL_MS),
  })
}
