import { useQuery } from '@tanstack/react-query'
import {
  getNetwork,
  listNetworkLabels,
  listNetworkPermissions,
  listNetworkVnicProfiles,
} from '../api/resources/networks'
import { useSettings } from '../settings/SettingsProvider'

// Networks are infrastructure entities that drift slowly and only load while
// the detail page is mounted; 60s matches the other admin/parity collections.
// The constant is a floor — the Preferences interval can slow the poll
// further, never speed it up past the VM cadence.
export const NETWORK_DETAIL_POLL_INTERVAL_MS = 60_000

// The network record itself, followed to inline the data center name. Keyed
// ['network', id] so the detail page can invalidate a single network
// wholesale; the subcollection hooks share the ['network', id, <slice>]
// prefix below.
export function useNetwork(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['network', id],
    queryFn: () => getNetwork(id),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useNetworkVnicProfiles(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['network', id, 'vnicProfiles'],
    queryFn: () => listNetworkVnicProfiles(id),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useNetworkLabels(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['network', id, 'labels'],
    queryFn: () => listNetworkLabels(id),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useNetworkPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['network', id, 'permissions'],
    queryFn: () => listNetworkPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_DETAIL_POLL_INTERVAL_MS),
  })
}
