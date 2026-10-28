import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { listHostsWithStats } from '../api/resources/hosts'
import { fetchApiInfo } from '../api/resources/system'
import { useCapabilities } from '../auth/capabilities'
import {
  aggregateCpuCapacity,
  aggregateMemory,
  aggregateStorage,
  aggregateVmAllocation,
  type CapacitySummary,
  type CpuCapacity,
  type VmAllocation,
} from '../lib/utilization'
import { useSettings } from '../settings/SettingsProvider'
import { useClustersInventory, useDataCenters, usePools } from './useAdminResources'
import { useEvents } from './useEvents'
import { HOST_POLL_INTERVAL_MS, hostKeys } from './useHosts'
import { useStorageDomains } from './useStorageDomains'
import { useVms } from './useVms'
import { apiInfoKeys } from './useProductBrand'

// Thin composition for DashboardPage: the queries stay independent so each
// card renders its own skeleton/error/empty/populated state — one failing
// query never blanks the others. Query keys match the ones the dedicated
// pages use ('vms', 'storagedomains', 'events', 'apiInfo', 'datacenters',
// 'clusters', 'pools'), so the dashboard shares their cache entries and poll
// cycles instead of adding engine load. The one dashboard-owned key is
// ['hosts', 'statistics']: HostsPage's plain ['hosts'] list never needs the
// gauge payload, and interval refetches only run while a page observes the
// query, so the two never poll at the same time.
export function useDashboard() {
  const vms = useVms()
  const storageDomains = useStorageDomains()
  const events = useEvents()
  const dataCenters = useDataCenters()
  const clusters = useClustersInventory()
  const pools = usePools()
  // Same key/fn pair as AboutPage; product info is effectively static, so no
  // refetch interval.
  const apiInfo = useQuery({ queryKey: apiInfoKeys.all, queryFn: fetchApiInfo })
  const hosts = useHostsWithStats()

  return { vms, storageDomains, events, apiInfo, dataCenters, clusters, pools, hosts }
}

export type DashboardQueries = ReturnType<typeof useDashboard>

// GET /hosts needs an admin session on the engine — skip the doomed request
// for user-tier accounts (the utilization card hides its host-fed metrics
// instead). Gating on isAdmin alone is safe: it stays false until the
// profile has loaded. Poll cadence matches useHosts (30s floor).
function useHostsWithStats() {
  const { isAdmin } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: hostKeys.statistics,
    queryFn: () => listHostsWithStats(),
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
    enabled: isAdmin,
  })
}

// ~40 samples at the 30s host/storage cadence ≈ the last twenty minutes.
export interface DashboardUtilization {
  // undefined while loading, on error, or when nothing reports the metric
  cpu?: CpuCapacity
  memory?: CapacitySummary
  storage?: CapacitySummary
  // estimated vCPU / memory allocation of resource-holding VMs; undefined
  // until the VM list lands
  allocation?: VmAllocation
}

// Aggregates the capacity card's metric summaries. Derived from the same
// query objects useDashboard returns, so the card stays in step with the poll
// cycle.
export function useDashboardUtilization(
  hosts: DashboardQueries['hosts'],
  storageDomains: DashboardQueries['storageDomains'],
  vms: DashboardQueries['vms'],
): DashboardUtilization {
  const cpu = useMemo(() => aggregateCpuCapacity(hosts.data ?? []), [hosts.data])
  const memory = useMemo(() => aggregateMemory(hosts.data ?? []), [hosts.data])
  const storage = useMemo(() => aggregateStorage(storageDomains.data ?? []), [storageDomains.data])
  const allocation = useMemo(
    () => (vms.data ? aggregateVmAllocation(vms.data) : undefined),
    [vms.data],
  )
  return { cpu, memory, storage, allocation }
}
