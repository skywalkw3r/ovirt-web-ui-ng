import { useQuery } from '@tanstack/react-query'
import { listClusters } from '../api/resources/clusters'
import { listDataCenters } from '../api/resources/datacenters'
import { listPools } from '../api/resources/pools'
import { listGroups, listUsers } from '../api/resources/users'
import { useCapabilities } from '../auth/capabilities'
import { useSettings } from '../settings/SettingsProvider'

// ClustersPage's Upgrade Status column reads the in-flight rolling-upgrade
// flag off the inventory rows this module serves; the predicate is surfaced
// here so the page consumes it through the hooks layer instead of importing
// api/resources (CLAUDE.md: transport → schemas → resources → hooks → pages).
export { isClusterUpgradeRunning } from '../api/resources/clusters'

// Query-key builders for the admin inventory collections. Every hook that
// registers one of these keys and every mutation that invalidates it builds
// the key here, so a hand-typed copy can never drift from the observer it is
// meant to hit. `all` is the bare prefix the mutations invalidate (it is ALSO
// the exact key the create-dialog option lists register — ClusterFormModal's
// data centers read ['datacenters'] bare, distinct from the searched
// ['datacenters', ''] inventory entry); `list` is the per-search entry the
// inventory hooks poll; `detail` the single-entity read.
export const poolKeys = {
  all: ['pools'] as const,
  detail: (id: string) => ['pool', id] as const,
  // PoolPermissionsTab's read — the PermissionEntityKind for pools is
  // 'vmpool' (the REST collection name), so this slice does NOT sit under
  // the ['pool', id] detail prefix; usePermissionMutations invalidates
  // exactly [kind, id, 'permissions'] and this is that key for pools
  permissions: (id: string) => ['vmpool', id, 'permissions'] as const,
}

export const userKeys = {
  all: ['users'] as const,
  list: (search = '') => ['users', search] as const,
  detail: (id: string) => ['user', id] as const,
  groups: (id: string) => ['user', id, 'groups'] as const,
  quotas: (id: string) => ['user', id, 'quotas'] as const,
  permissions: (id: string) => ['user', id, 'permissions'] as const,
  eventSubscriptions: (id: string) => ['user', id, 'eventSubscriptions'] as const,
}

export const groupKeys = {
  all: ['groups'] as const,
  list: (search = '') => ['groups', search] as const,
}

// The chained option queries in the VM/template modals (Clone, Export, Make
// Template, Manage Networks) key their DC subcollection read on a data center
// id that is undefined until the cluster read lands — the query is disabled
// then, but the key shape ['datacenter', undefined, <slice>] is what those
// sites register, so the slice builders accept the undefined id verbatim
// rather than substituting a placeholder.
export const dataCenterKeys = {
  all: ['datacenters'] as const,
  list: (search = '') => ['datacenters', search] as const,
  detail: (id: string) => ['datacenter', id] as const,
  storageDomains: (id: string | undefined) => ['datacenter', id, 'storageDomains'] as const,
  networks: (id: string | undefined) => ['datacenter', id, 'networks'] as const,
  clusters: (id: string | undefined) => ['datacenter', id, 'clusters'] as const,
  qoss: (id: string | undefined) => ['datacenter', id, 'qoss'] as const,
  // The vNIC-profile and CPU-profile modals' QoS pickers read the same
  // /datacenters/{id}/qoss collection under a SEPARATE flat key — a
  // pre-builder inconsistency with `qoss` above that the QoS mutations paper
  // over by invalidating both (useDataCenterQosMutations). Unifying the two
  // is a cache-contract change for a follow-up; both shapes stay verbatim.
  qosPicker: (id: string | undefined) => ['datacenter-qoss', id] as const,
  quotas: (id: string) => ['datacenter', id, 'quotas'] as const,
  permissions: (id: string) => ['datacenter', id, 'permissions'] as const,
  iscsiBonds: (id: string) => ['datacenter', id, 'iscsiBonds'] as const,
}

export const clusterKeys = {
  all: ['clusters'] as const,
  list: (search = '') => ['clusters', search] as const,
  // undefined is accepted for the same chained-modal reason as dataCenterKeys:
  // Clone/Export/Make Template key on vm.cluster?.id before it is known
  detail: (id: string | undefined) => ['cluster', id] as const,
  // the cluster's cpuprofiles subcollection — useClusterCpuProfiles
  // (useClusterDetail) and the Edit VM CPU-profile select share this entry
  cpuProfiles: (id: string) => ['cluster', id, 'cpuProfiles'] as const,
  networks: (id: string) => ['cluster', id, 'networks'] as const,
  affinityGroups: (id: string) => ['cluster', id, 'affinityGroups'] as const,
  affinityLabels: (id: string) => ['cluster', id, 'affinityLabels'] as const,
  permissions: (id: string | undefined) => ['cluster', id, 'permissions'] as const,
  hosts: (id: string) => ['cluster', id, 'hosts'] as const,
  // the cluster's VMs are the global /vms narrowed by cluster= — keyed by NAME
  vms: (name: string) => ['cluster', name, 'vms'] as const,
}

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
    queryKey: poolKeys.all,
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
    queryKey: userKeys.list(search),
    queryFn: () => listUsers({ search: search || undefined }),
    refetchInterval,
    enabled: isAdmin,
  })
}

// GET /groups — the directory groups materialized into the engine DB (the
// Groups tab of UsersGroupsPage). Admin-only for the same reason as useUsers.
// Shares the ['groups', search] cache entries the Add-Permission group picker
// reads (usePermissionMutations.useGroups) — this observer just adds the poll
// and the admin gate, mirroring useClustersInventory over useCatalog's
// useClusters; both queryFns issue the identical URL for a given search.
export function useGroupsInventory(search = '') {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: groupKeys.list(search),
    queryFn: () => listGroups({ search: search || undefined }),
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
    queryKey: dataCenterKeys.list(search),
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
    queryKey: clusterKeys.list(search),
    queryFn: () => listClusters({ search: search || undefined }),
    refetchInterval,
    enabled: isAdmin,
  })
}
