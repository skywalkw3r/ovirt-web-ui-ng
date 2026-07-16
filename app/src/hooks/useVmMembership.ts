import { useMemo } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Vm } from '../api/schemas/vm'
import { useVms } from './useVms'

// The VMs belonging to a parent entity (cluster, pool, template, quota). None
// of these parents exposes a →VM REST subcollection, but the global /vms feed
// inlines each VM's parent links, so membership is that list client-filtered
// by predicate rather than a round-trip through the search DSL.
//
// A thin wrapper over the shared useVms('') observer rather than its own query:
// it joins the single ['vms', ''] cache entry the VMs list / dashboard /
// inventory pages already poll, so it inherits the payload-aware poll floor
// (vmPollIntervalMs floors /vms at 30s/60s past 500/2000 VMs) and the ['vms']
// mutation invalidation for free, and costs zero extra requests wherever VMs
// are already polling. The previous [entity, id, 'vms'] key re-downloaded the
// whole payload every tick under a name ['vms'] invalidation never matched, so
// membership went stale after VM actions until the next poll.
//
// The trade: a private key let a parent EDIT's prefix invalidation refetch
// membership; sharing ['vms', ''] drops that — the better trade, since VM
// lifecycle changes are what actually move membership (a rename never changes
// which VMs belong) and those hit ['vms']. The leading params are retained
// (underscore-prefixed) for the call signature the tabs pass positionally but
// no longer key anything.
export function useVmMembership(
  _entity: string,
  _entityId: string,
  isMember: (vm: Vm) => boolean,
): UseQueryResult<Vm[], Error> {
  const query = useVms('')
  // membership = the shared list filtered by the parent predicate; undefined
  // while the observer is still pending so the table's isPending guard fires
  // before any .length read. Recomputed when the list or predicate changes —
  // the tabs pass a fresh predicate each render, matching the old `select`.
  const data = useMemo(
    () => (query.data === undefined ? undefined : query.data.filter(isMember)),
    [query.data, isMember],
  )
  return { ...query, data } as UseQueryResult<Vm[], Error>
}
