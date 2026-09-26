import { useQuery } from '@tanstack/react-query'
import { getPool } from '../api/resources/pools'
import { poolKeys, useAdminResourcePollInterval } from './useAdminResources'

// GET /vmpools/{id} — the single pool PoolDetailPage renders, keyed
// ['pool', id] (poolKeys.detail). Pools are near-static inventory, so the read
// polls at the 60s admin floor like the ['pools'] list; it is deliberately NOT
// capability-gated — pools are how user-tier accounts grab a VM, so the detail
// route is user-visible just like usePools. The read stays bare (see getPool:
// following the optional cluster/template links 500s on a live engine), so the
// page resolves the cluster name client-side against the clusters catalog.
// A missing id 404s — the page maps that to its not-found state.
export function usePool(id: string) {
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: poolKeys.detail(id),
    queryFn: () => getPool(id),
    refetchInterval,
  })
}
