import { useQuery } from '@tanstack/react-query'
import { listClusterCpuProfiles } from '../../api/resources/clusters'
import { clusterKeys } from '../../hooks/useAdminResources'

// The cpuProfiles context of the shared ResourceAllocationSection (contract in
// vmBaseDraft.ts). Keyed like useClusterCpuProfiles (clusterKeys.cpuProfiles)
// so the cluster detail page and every form share the cache; no poll, and
// disabled until a cluster is known (the section shows an idle query as "no
// profiles").
export function useCpuProfileOptions(clusterId: string) {
  return useQuery({
    queryKey: clusterKeys.cpuProfiles(clusterId),
    queryFn: () => listClusterCpuProfiles(clusterId),
    enabled: clusterId !== '',
  })
}
