import { useQuery } from '@tanstack/react-query'
import { listClusters } from '../api/resources/clusters'
import { listDataCenters } from '../api/resources/datacenters'
import { listPools } from '../api/resources/pools'
import { listUsers } from '../api/resources/users'
import { useCapabilities } from '../auth/capabilities'
import { useSettings } from '../settings/SettingsProvider'

// Pools, users, data centers, and clusters are near-static inventory; 60s
// keeps them fresh without adding to the engine load the 10s VM poll and the
// 30s infrastructure polls already generate. The constant is a floor — the
// Preferences interval can slow these polls further, never speed them up.
export const ADMIN_RESOURCE_POLL_INTERVAL_MS = 60_000

// Shared by the admin inventory hooks here and in useParityResources.
export function useAdminResourcePollInterval() {
  const { refreshIntervalMs } = useSettings()
  return Math.max(refreshIntervalMs, ADMIN_RESOURCE_POLL_INTERVAL_MS)
}

// GET /vmpools is user-tier visible (pools are how user accounts grab a VM),
// so unlike the queries below it is not capability-gated.
export function usePools() {
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['pools'],
    queryFn: () => listPools(),
    refetchInterval,
  })
}

// GET /users needs an admin session on the engine — skip the doomed request
// for user-tier accounts (UsersPage renders <NotPermitted> instead). Gating
// on isAdmin alone is safe: it stays false until the profile has loaded.
// The committed search rides in the query key so each engine-DSL query caches
// (and polls) separately; no-arg callers share the '' entry — mirror
// useDataCenters. The Add Permission picker shares this cache through
// usePermissionUsers (ungated — see usePermissionMutations).
export function useUsers(search = '') {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['users', search],
    queryFn: () => listUsers({ search: search || undefined }),
    refetchInterval,
    enabled: isAdmin,
  })
}

// Admin-only for the same reason as useUsers. The committed search rides in
// the query key so each engine-DSL query caches (and polls) separately;
// no-arg callers share the '' entry — mirror useEvents.
export function useDataCenters(search = '') {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['datacenters', search],
    queryFn: () => listDataCenters({ search: search || undefined }),
    refetchInterval,
    enabled: isAdmin,
  })
}

// Admin-only for the same reason as useUsers. Named apart from useCatalog's
// useClusters (the ungated create-wizard variant); both share the
// ['clusters', ''] cache entry when unsearched, this observer just adds the
// poll and the capability gate. Search-key rationale as useDataCenters.
export function useClustersInventory(search = '') {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['clusters', search],
    queryFn: () => listClusters({ search: search || undefined }),
    refetchInterval,
    enabled: isAdmin,
  })
}
