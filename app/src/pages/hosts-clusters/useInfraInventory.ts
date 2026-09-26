import { useMemo } from 'react'
import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import type { Vm } from '../../api/schemas/vm'
import type { VmListCtx, VmListRow } from '../../components/vmListColumns'
import { useClustersInventory, useDataCenters } from '../../hooks/useAdminResources'
import { useHosts, useHostsUsage } from '../../hooks/useHosts'
import { useVms } from '../../hooks/useVms'
import { useT } from '../../i18n/useT'
import type { InfraClusterColumnCtx, InfraHostColumnCtx } from './infraColumns'
import { EMPTY, type InfraSelection } from './infraModel'

// The Hosts & Clusters data layer: the four inventory reads, their id-keyed
// joins, the entity the tree selection resolves to, and the rows each grid
// shows for that scope. Pure derivation over the query caches — the sorting
// and paging of those rows is usePaneTable's job.

// The scoped-VM grid's row: always the VM half of the shared VM-list row union
// (the mixed VM/template shape belongs to the VMs & Templates view).
export type VmPaneRow = Extract<VmListRow, { kind: 'vm' }>

export interface InfraInventory {
  dataCenters: ReturnType<typeof useDataCenters>
  clusters: ReturnType<typeof useClustersInventory>
  hosts: ReturnType<typeof useHosts>
  vms: ReturnType<typeof useVms>
  dcs: DataCenter[]
  allClusters: Cluster[]
  allHosts: Host[]
  allVms: Vm[]
  hostsById: Map<string, Host>
  clustersById: Map<string, Cluster>
  dcsById: Map<string, DataCenter>
  hostsByCluster: Map<string, Host[]>
  // the selected entity per kind — undefined once a poll drops it (or for any
  // other kind), which safely falls back to the root scope
  selectedDc: DataCenter | undefined
  selectedCluster: Cluster | undefined
  selectedHost: Host | undefined
  selectedHostClusterName: string | undefined
  selectedClusterDcName: string | undefined
  // the join contexts the grids' cells and sortValue extractors read
  vmCtx: VmListCtx
  hostCtx: InfraHostColumnCtx
  clusterCtx: InfraClusterColumnCtx
  // the current scope's rows, unsorted, in the shape each grid's catalog reads
  scopedVmRows: VmPaneRow[]
  scopedHosts: Host[]
  scopedClusters: Cluster[]
  // the tree gates on the three cheap inventory reads only
  treePending: boolean
  treeError: boolean
  treeErrorValue: unknown
}

export function useInfraInventory(
  selection: InfraSelection | null,
  {
    hostsUsageEnabled,
  }: {
    // true only while the Hosts grid is on screen (see hostsUsage below)
    hostsUsageEnabled: boolean
  },
): InfraInventory {
  const t = useT()
  const dataCenters = useDataCenters()
  const clusters = useClustersInventory()
  // The cheap inventory read (all_content for the HE crown, no statistics
  // follows) drives the tree, the joins and the cluster pane's host rows — and
  // shares the ['hosts', ''] cache entry with every other inventory consumer.
  // The expensive usage read (hostsUsage below) fires only while a Hosts grid
  // is open.
  const hosts = useHosts()
  const vms = useVms()
  // Usage gauges (Memory/CPU/Network columns) render only in the hosts grid,
  // so the statistics + per-NIC-statistics read — the heaviest host query the
  // engine offers — stays idle until the Hosts grid is on screen. Its rows
  // merge over the cheap list's below; gauge cells render an em dash until it
  // lands.
  const hostsUsage = useHostsUsage('', { enabled: hostsUsageEnabled })

  const dcs = dataCenters.data ?? EMPTY
  const allClusters = clusters.data ?? EMPTY
  const allHosts = hosts.data ?? EMPTY
  const allVms = vms.data ?? EMPTY

  // Id-keyed lookup maps: the join cells and selection resolution run O(1)
  // per row instead of scanning the inventories (O(VMs × hosts) at scale).
  const hostsById = useMemo(() => new Map(allHosts.map((host) => [host.id, host])), [allHosts])
  const clustersById = useMemo(
    () => new Map(allClusters.map((cluster) => [cluster.id, cluster])),
    [allClusters],
  )
  const dcsById = useMemo(() => new Map(dcs.map((dc) => [dc.id, dc])), [dcs])
  const hostsByCluster = useMemo(() => {
    const grouped = new Map<string, Host[]>()
    for (const host of allHosts) {
      if (host.cluster?.id === undefined) continue
      const bucket = grouped.get(host.cluster.id)
      if (bucket) bucket.push(host)
      else grouped.set(host.cluster.id, [host])
    }
    return grouped
  }, [allHosts])

  // VMs per cluster — feeds the clusters grid's VM Count column (the tree
  // itself no longer shows count badges).
  const vmsByCluster = useMemo(() => {
    const byCluster = new Map<string, number>()
    for (const vm of allVms) {
      if (vm.cluster?.id !== undefined)
        byCluster.set(vm.cluster.id, (byCluster.get(vm.cluster.id) ?? 0) + 1)
    }
    return byCluster
  }, [allVms])

  // Joins for the scoped-VM cells and their sortValue extractors — memoized
  // so the sorted-rows memo downstream only re-runs when an inventory actually
  // changed, not on every render.
  const vmCtx: VmListCtx = useMemo(
    () => ({
      hostName: (id) => (id !== undefined ? hostsById.get(id)?.name : undefined),
      clusterName: (id) => (id !== undefined ? clustersById.get(id)?.name : undefined),
      dataCenter: (clusterId) => {
        const dcId =
          clusterId !== undefined ? clustersById.get(clusterId)?.data_center?.id : undefined
        const dc = dcId !== undefined ? dcsById.get(dcId) : undefined
        return dc !== undefined && dc.name !== undefined ? { id: dc.id, name: dc.name } : undefined
      },
    }),
    [hostsById, clustersById, dcsById],
  )

  // Resolve the concrete entity for the selected kind (undefined once a poll
  // refetch drops it — e.g. a removed cluster — which safely falls back to
  // the all-VMs view).
  const selectedCluster = selection?.kind === 'cluster' ? clustersById.get(selection.id) : undefined
  const selectedHost = selection?.kind === 'host' ? hostsById.get(selection.id) : undefined
  // the host object's cluster ref may be a bare id stub — resolve the display
  // name against the clusters inventory for the header meta line
  const selectedHostClusterName =
    selectedHost?.cluster?.name ??
    (selectedHost?.cluster?.id !== undefined
      ? clustersById.get(selectedHost.cluster.id)?.name
      : undefined)
  // the cluster's data_center ref may be a bare id stub — resolve the display
  // name against the data centers list for the header meta line
  const selectedClusterDcName =
    selectedCluster?.data_center?.name ??
    (selectedCluster?.data_center?.id !== undefined
      ? dcsById.get(selectedCluster.data_center.id)?.name
      : undefined)
  const selectedDc = selection?.kind === 'datacenter' ? dcsById.get(selection.id) : undefined

  // The VM table scope: host by run-on link, cluster by cluster link, DC
  // through its clusters, root (or nothing, or a stale selection) shows all
  // VMs. Memoized (with the row wrap below) so the VM grid's sort memo only
  // re-runs when the collection or the selection actually changed.
  const scopedVms: Vm[] = useMemo(() => {
    if (selectedHost) return allVms.filter((vm) => vm.host?.id === selectedHost.id)
    if (selectedCluster) return allVms.filter((vm) => vm.cluster?.id === selectedCluster.id)
    if (selectedDc) {
      const clusterIds = new Set(
        allClusters.filter((cluster) => cluster.data_center?.id === selectedDc.id).map((c) => c.id),
      )
      return allVms.filter((vm) => vm.cluster?.id !== undefined && clusterIds.has(vm.cluster.id))
    }
    return allVms
  }, [allVms, allClusters, selectedHost, selectedCluster, selectedDc])
  // the shared VM-list columns read the { kind: 'vm' } row shape, not a bare Vm
  const scopedVmRows = useMemo(
    () => scopedVms.map((vm): VmPaneRow => ({ kind: 'vm', vm })),
    [scopedVms],
  )

  const hostCtx: InfraHostColumnCtx = {
    clusterName: (id) => (id !== undefined ? clustersById.get(id)?.name : undefined),
    dataCenter: (clusterId) => {
      const dcId =
        clusterId !== undefined ? clustersById.get(clusterId)?.data_center?.id : undefined
      const dc = dcId !== undefined ? dcsById.get(dcId) : undefined
      return dc !== undefined && dc.name !== undefined ? { id: dc.id, name: dc.name } : undefined
    },
    t,
  }
  const clusterCtx: InfraClusterColumnCtx = {
    hostCount: (clusterId) => hostsByCluster.get(clusterId)?.length ?? 0,
    vmCount: (clusterId) => vmsByCluster.get(clusterId) ?? 0,
  }

  // Hosts for the current scope — the cluster's, the DC's (across its
  // clusters), or every host at the root — upgraded in place with the usage
  // read's statistics once it lands (same object shape — the usage row is a
  // superset), so identity/status render immediately and gauges fill in.
  const usageById = new Map((hostsUsage.data ?? []).map((host) => [host.id, host]))
  const scopedHostsBase = selectedCluster
    ? (hostsByCluster.get(selectedCluster.id) ?? [])
    : selectedDc
      ? allHosts.filter((host) => {
          const cluster =
            host.cluster?.id !== undefined ? clustersById.get(host.cluster.id) : undefined
          return cluster?.data_center?.id === selectedDc.id
        })
      : allHosts
  const scopedHosts = scopedHostsBase.map((host) => usageById.get(host.id) ?? host)

  // Clusters for the current scope — the selected DC's, or every cluster at
  // the root. (A cluster or host selection has no Clusters tab.)
  const scopedClusters = selectedDc
    ? allClusters.filter((cluster) => cluster.data_center?.id === selectedDc.id)
    : allClusters

  return {
    dataCenters,
    clusters,
    hosts,
    vms,
    dcs,
    allClusters,
    allHosts,
    allVms,
    hostsById,
    clustersById,
    dcsById,
    hostsByCluster,
    selectedDc,
    selectedCluster,
    selectedHost,
    selectedHostClusterName,
    selectedClusterDcName,
    vmCtx,
    hostCtx,
    clusterCtx,
    scopedVmRows,
    scopedHosts,
    scopedClusters,
    // The tree renders as soon as the cheap inventory reads land; the VM pane
    // gates on the VM query alone — the view never waits for the slowest of
    // four collections before showing anything.
    treePending: dataCenters.isPending || clusters.isPending || hosts.isPending,
    treeError: dataCenters.isError || clusters.isError || hosts.isError,
    treeErrorValue: dataCenters.error ?? clusters.error ?? hosts.error,
  }
}
