import { useQuery } from '@tanstack/react-query'
import { listVms } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useSettings } from '../settings/SettingsProvider'

// The VMs belonging to a parent entity (cluster, pool, template, quota). None
// of these parents exposes a →VM REST subcollection, but the global /vms feed
// inlines each VM's parent links, so membership is the global list client-
// filtered by predicate rather than a round-trip through the search DSL.
// Keyed [entity, id, 'vms'] so a rename never orphans the cache entry and a
// parent edit's prefix invalidation refetches the membership too.
export function useVmMembership(entity: string, entityId: string, isMember: (vm: Vm) => boolean) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: [entity, entityId, 'vms'],
    queryFn: () => listVms(),
    select: (data) => data.filter(isMember),
    refetchInterval: refreshIntervalMs,
  })
}
