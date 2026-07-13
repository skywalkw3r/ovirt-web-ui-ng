import { useQuery } from '@tanstack/react-query'
import {
  listNetworkHosts,
  listNetworkTemplates,
  listNetworkVms,
} from '../../api/resources/networks'
import { NETWORK_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useNetworkDetail'
import { useSettings } from '../../settings/SettingsProvider'

// Membership reads for the Hosts / VMs / Templates subtabs. They live beside
// the tabs (not in hooks/) because each is a client-side join the resource
// layer assembles rather than a single REST subcollection — see the join
// rationale in resources/networks.ts. All three share the ['network', id, …]
// query-key prefix the other network-detail slices use, and treat the 60s
// NETWORK_DETAIL_POLL_INTERVAL_MS as a floor: the Preferences interval can slow
// the poll further but never speed it past the VM cadence (admin/parity rule).

export function useNetworkHosts(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['network', id, 'hosts'],
    queryFn: () => listNetworkHosts(id),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useNetworkVms(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['network', id, 'vms'],
    queryFn: () => listNetworkVms(id),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useNetworkTemplates(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['network', id, 'templates'],
    queryFn: () => listNetworkTemplates(id),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })
}
