import { useQueries, useQuery } from '@tanstack/react-query'
import { listHostNumaNodes, type HostNumaNode } from '../api/resources/hostNuma'
import { listVmNumaNodes } from '../api/resources/vmNuma'
import { hostKeys } from './useHosts'

// The VM vNUMA slice nests under the VM detail key (['vm', id, <slice>], the
// vmKeys convention) so a VM detail invalidation reaches it by prefix.
export const vmNumaKeys = {
  vm: (vmId: string) => ['vm', vmId, 'numanodes'] as const,
}

// The VM's virtual NUMA nodes, read by the Edit VM modal to seed the draft and
// by its Host section for the loading/error states. Not polled: the topology
// only moves through an edit, which invalidates it.
export function useVmNumaNodes(vmId: string, enabled = true) {
  return useQuery({
    queryKey: vmNumaKeys.vm(vmId),
    queryFn: () => listVmNumaNodes(vmId),
    enabled: enabled && vmId !== '',
  })
}

// The physical NUMA topology of each host the VM is pinned to, in the order
// given (the first host is the one webadmin's NUMA pinning dialog shows, so its
// nodes are the pin targets). Shares hostKeys.numaNodes with the host NUMA tab,
// one cache entry per host. `nodes` is undefined until that host's read lands.
export function usePlacementHostNumaNodes(hostIds: string[], enabled = true) {
  const results = useQueries({
    queries: hostIds.map((hostId) => ({
      queryKey: hostKeys.numaNodes(hostId),
      queryFn: () => listHostNumaNodes(hostId),
      enabled,
    })),
  })
  return {
    hosts: hostIds.map((hostId, position): { hostId: string; nodes?: HostNumaNode[] } => ({
      hostId,
      nodes: results[position]?.data,
    })),
    isPending: enabled && results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
    error: results.find((result) => result.isError)?.error ?? null,
    refetch: () => {
      for (const result of results) {
        if (result.isError) void result.refetch()
      }
    },
  }
}

export type PlacementHostNumaNodes = ReturnType<typeof usePlacementHostNumaNodes>
