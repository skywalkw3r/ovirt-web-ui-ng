import { useQuery } from '@tanstack/react-query'
import {
  getCluster,
  listClusterAffinityGroups,
  listClusterAffinityLabels,
  listClusterCpuProfiles,
  listClusterNetworks,
  listClusterPermissions,
} from '../api/resources/clusters'
import { listHosts } from '../api/resources/hosts'
import { listVms } from '../api/resources/vms'
import { HOST_POLL_INTERVAL_MS } from './useHosts'
import { useSettings } from '../settings/SettingsProvider'

// Cluster subcollections drift slowly and only load while the detail page is
// mounted; 60s matches the other admin/parity collections. The constant is a
// floor — the Preferences interval can slow the poll further, never speed it up
// past the VM cadence.
export const CLUSTER_DETAIL_POLL_INTERVAL_MS = 60_000

// The cluster itself and every subcollection hook share the ['cluster', id,
// <slice>] key prefix so the detail page can invalidate a single cluster
// wholesale. They intentionally do not gate on isAdmin: the detail route
// already sits behind the admin-gated ClustersPage, and the hooks only run once
// a clusterId is in hand.
export function useCluster(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', id],
    queryFn: () => getCluster(id),
    refetchInterval: Math.max(refreshIntervalMs, CLUSTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useClusterNetworks(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', id, 'networks'],
    queryFn: () => listClusterNetworks(id),
    refetchInterval: Math.max(refreshIntervalMs, CLUSTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useClusterAffinityGroups(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', id, 'affinityGroups'],
    queryFn: () => listClusterAffinityGroups(id),
    refetchInterval: Math.max(refreshIntervalMs, CLUSTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useClusterAffinityLabels(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', id, 'affinityLabels'],
    queryFn: () => listClusterAffinityLabels(id),
    refetchInterval: Math.max(refreshIntervalMs, CLUSTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useClusterCpuProfiles(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', id, 'cpuProfiles'],
    queryFn: () => listClusterCpuProfiles(id),
    refetchInterval: Math.max(refreshIntervalMs, CLUSTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useClusterPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', id, 'permissions'],
    queryFn: () => listClusterPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, CLUSTER_DETAIL_POLL_INTERVAL_MS),
  })
}

// The hosts in a cluster and the VMs in a cluster are not REST subcollections —
// they are the global /hosts and /vms collections narrowed to this cluster.
// The engine's hosts DSL has no cluster-id term (only cluster = <name>, which a
// rename would race), so the Hosts tab pulls the global list and filters
// client-side on the cluster back-link. VMs support cluster=<name>, mirroring
// useHostDetail's host.name= approach — so the VMs hook narrows server-side.
// Both are keyed under the ['cluster', id, …] prefix for symmetry with the
// subcollection slices above.
export function useClusterHosts(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', id, 'hosts'],
    queryFn: async () => {
      // all_content populates the computed hosted_engine field the crown reads
      // (HostedEngineCrown on ClusterHostsTab) — the same shape useHosts fetches.
      const hosts = await listHosts({ allContent: true })
      return hosts.filter((host) => host.cluster?.id === id)
    },
    // This pulls the GLOBAL /hosts collection and filters client-side, so it
    // carries the same full-inventory cost as the Hosts page and floors at the
    // hosts cadence (30s, HOST_POLL_INTERVAL_MS) — NOT this file's 60s
    // cluster-detail floor, which is for the cheap own-subcollection reads.
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
    // Empty id ⇒ genuinely idle. The affinity group/label modal pickers pass ''
    // while closed; without this gate the full /hosts read still fires every
    // tick only to filter down to [].
    enabled: id !== '',
  })
}

// Keyed by cluster name (what the search filters on) so a rename gets its own
// cache entry, mirroring useHostDetail's useHostVms.
export function useClusterVms(clusterName: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['cluster', clusterName, 'vms'],
    queryFn: () => listVms({ search: `cluster=${clusterName}` }),
    refetchInterval: refreshIntervalMs,
    // Empty name ⇒ genuinely idle. The picker consumers pass '' while their
    // modal is closed; without this gate the query fires
    // GET /vms?search=cluster%3D — malformed DSL a live engine rejects — every
    // tick, re-attempted by the retry policy.
    enabled: clusterName !== '',
  })
}
