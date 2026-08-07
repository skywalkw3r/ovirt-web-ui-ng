import { useQuery } from '@tanstack/react-query'
import {
  getDataCenter,
  listDataCenterClusters,
  listDataCenterNetworks,
  listDataCenterPermissions,
  listDataCenterQoss,
  listDataCenterQuotas,
  listDataCenterStorageDomains,
} from '../api/resources/datacenters'
import { useSettings } from '../settings/SettingsProvider'

// Data center subcollections drift slowly and only load while the detail page
// is mounted; 60s matches the other admin/parity collections. The constant is a
// floor — the Preferences interval can slow the poll further, never speed it up
// past the VM cadence.
export const DATA_CENTER_DETAIL_POLL_INTERVAL_MS = 60_000

// The data center itself and every subcollection hook share the
// ['datacenter', id, <slice>] key prefix so the detail page can invalidate a
// single data center wholesale. They intentionally do not gate on isAdmin: the
// detail route already sits behind the admin-gated DataCentersPage, and the
// hooks only run once a dataCenterId is in hand.
export function useDataCenter(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', id],
    queryFn: () => getDataCenter(id),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDataCenterStorageDomains(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', id, 'storageDomains'],
    queryFn: () => listDataCenterStorageDomains(id),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDataCenterNetworks(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', id, 'networks'],
    queryFn: () => listDataCenterNetworks(id),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDataCenterClusters(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', id, 'clusters'],
    queryFn: () => listDataCenterClusters(id),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDataCenterQoss(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', id, 'qoss'],
    queryFn: () => listDataCenterQoss(id),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDataCenterQuotas(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', id, 'quotas'],
    queryFn: () => listDataCenterQuotas(id),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })
}

export function useDataCenterPermissions(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['datacenter', id, 'permissions'],
    queryFn: () => listDataCenterPermissions(id),
    refetchInterval: Math.max(refreshIntervalMs, DATA_CENTER_DETAIL_POLL_INTERVAL_MS),
  })
}
