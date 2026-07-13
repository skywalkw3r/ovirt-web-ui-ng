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
      const hosts = await listHosts()
      return hosts.filter((host) => host.cluster?.id === id)
    },
    refetchInterval: refreshIntervalMs,
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
  })
}
