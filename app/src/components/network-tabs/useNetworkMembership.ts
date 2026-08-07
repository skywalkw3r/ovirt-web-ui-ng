import { useQuery } from '@tanstack/react-query'
import {
  listNetworkHosts,
  listNetworkTemplates,
  listNetworkVms,
} from '../../api/resources/networks'

// Membership reads for the Hosts / VMs / Templates subtabs. They live beside the
// tabs (not in hooks/) because each is a client-side join the resource layer
// assembles rather than a single REST subcollection — see the join rationale in
// resources/networks.ts. All three share the ['network', id, …] query-key prefix
// the other network-detail slices use.
//
// These do NOT poll. Attachment/membership topology drifts slowly and each read
// is expensive: the Hosts join fans out one attachment read per host, and the
// VMs/Templates joins each pull the ENTIRE /vms or /templates collection with
// follow=nics — polling that every 60s per open tab was the H-5/H-6 engine-load
// finding. So refetchInterval is off and a 5min staleTime lets a tab revisit
// inside the window reuse the cache. The toolbar RefreshControl invalidates every
// query, so a manual refresh still refetches these on demand.
const MEMBERSHIP_QUERY_OPTIONS = {
  refetchInterval: false as const,
  staleTime: 5 * 60_000,
}

export function useNetworkHosts(id: string) {
  return useQuery({
    queryKey: ['network', id, 'hosts'],
    queryFn: () => listNetworkHosts(id),
    ...MEMBERSHIP_QUERY_OPTIONS,
  })
}

export function useNetworkVms(id: string) {
  return useQuery({
    queryKey: ['network', id, 'vms'],
    queryFn: () => listNetworkVms(id),
    ...MEMBERSHIP_QUERY_OPTIONS,
  })
}

export function useNetworkTemplates(id: string) {
  return useQuery({
    queryKey: ['network', id, 'templates'],
    queryFn: () => listNetworkTemplates(id),
    ...MEMBERSHIP_QUERY_OPTIONS,
  })
}
