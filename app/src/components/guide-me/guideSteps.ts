import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import type { MessageId } from '../../i18n/messages/en'

// Pure derivation of the "Guide Me" checklist — the webadmin
// DataCenterGuideModel / ClusterGuideModel translated to our read models. It
// works entirely off data already in the query cache (clusters, hosts, storage
// domains); no engine calls happen here, which keeps the logic unit-testable
// and the modal a thin renderer over the returned steps.

// The action an unmet step's button performs. This is pure data — GuideMeModal
// maps each kind to a behavior (open the shared New cluster / New host modal,
// or navigate to the storage view). Mirrors the command set each webadmin
// guide model exposes.
export type GuideStepAction =
  | { kind: 'new-cluster' }
  | { kind: 'new-host' }
  // Data/ISO storage attaches on the data center's Storage tab (or the SD
  // page); the modal navigates there rather than duplicating the flow. The DC
  // id is empty only for a cluster that is not yet attached to a data center.
  | { kind: 'attach-storage'; dataCenterId: string; storageKind: 'data' | 'iso' }

export interface GuideStep {
  // stable id — React key and the handle the tests assert against
  id: string
  // i18n message ids — GuideMeModal resolves them so this stays a pure,
  // presentation-free derivation (and locale-agnostic in the tests)
  titleId: MessageId
  descriptionId: MessageId
  // compulsory (webadmin "actions") vs optional (webadmin "optionalActions")
  required: boolean
  // met → rendered checked with the count; unmet → rendered as an action row
  complete: boolean
  // how many satisfying resources exist (shown beside a complete step)
  count: number
  // the button's action when the step is unmet
  action: GuideStepAction
  actionLabelId: MessageId
  // when set, the action is disabled with this reason — an ordering guard
  // (webadmin's blockedReason, e.g. "Add a cluster first"), not a hard error
  blockedReasonId?: MessageId
}

// ── Shared predicates (exported for direct unit coverage) ───────────────────

export function clustersInDataCenter(clusters: Cluster[], dataCenterId: string): Cluster[] {
  return clusters.filter((cluster) => cluster.data_center?.id === dataCenterId)
}

export function hostsInClusters(hosts: Host[], clusterIds: ReadonlySet<string>): Host[] {
  return hosts.filter((host) => host.cluster?.id !== undefined && clusterIds.has(host.cluster.id))
}

export function hostsInCluster(hosts: Host[], clusterId: string): Host[] {
  return hosts.filter((host) => host.cluster?.id === clusterId)
}

export function isHostUp(host: Host): boolean {
  return (host.status ?? '').toLowerCase() === 'up'
}

// Storage domains attached to this data center — the followed data_centers link
// carries the DC id. An unattached domain has no such link, so it never matches.
export function attachedDomains(
  storageDomains: StorageDomain[],
  dataCenterId: string,
  type: 'data' | 'iso',
): StorageDomain[] {
  return storageDomains.filter(
    (domain) =>
      domain.type === type &&
      (domain.data_centers?.data_center ?? []).some((dc) => dc.id === dataCenterId),
  )
}

// Attached AND Active — the reachable/usable state a data center comes up on.
// (Only attached domains report a per-DC `status`; unattached ones carry only
// `external_status`, so the status check doubles as an attachment guard.)
export function attachedActiveDomains(
  storageDomains: StorageDomain[],
  dataCenterId: string,
  type: 'data' | 'iso',
): StorageDomain[] {
  return attachedDomains(storageDomains, dataCenterId, type).filter(
    (domain) => (domain.status ?? '').toLowerCase() === 'active',
  )
}

// ── Data center guide ───────────────────────────────────────────────────────
// Non-local path (updateOptionsNonLocalFS): configure clusters → configure
// hosts → attach+activate data storage → optionally attach an ISO library. A
// local-storage DC follows the same checklist shape (a local DC still needs a
// cluster, its one host, and an active local data domain), so we do not branch.

export function deriveDataCenterGuide(input: {
  dataCenter: DataCenter
  clusters: Cluster[]
  hosts: Host[]
  storageDomains: StorageDomain[]
}): GuideStep[] {
  const { dataCenter, clusters, hosts, storageDomains } = input
  const dataCenterId = dataCenter.id

  const dcClusters = clustersInDataCenter(clusters, dataCenterId)
  const clusterIds = new Set(dcClusters.map((cluster) => cluster.id))
  const dcHosts = hostsInClusters(hosts, clusterIds)
  const upHosts = dcHosts.filter(isHostUp)
  const activeData = attachedActiveDomains(storageDomains, dataCenterId, 'data')
  const attachedIso = attachedDomains(storageDomains, dataCenterId, 'iso')

  const hasClusters = dcClusters.length > 0
  const hasUpHost = upHosts.length > 0

  return [
    {
      id: 'clusters',
      titleId: 'guide.step.clusters.title',
      descriptionId: 'guide.step.clusters.desc',
      required: true,
      complete: hasClusters,
      count: dcClusters.length,
      action: { kind: 'new-cluster' },
      actionLabelId: 'guide.step.clusters.action',
    },
    {
      id: 'hosts',
      titleId: 'guide.step.hosts.title',
      descriptionId: 'guide.step.dc.hosts.desc',
      required: true,
      complete: dcHosts.length > 0,
      count: dcHosts.length,
      action: { kind: 'new-host' },
      actionLabelId: 'guide.step.hosts.action',
      // webadmin gates Add Host on clusters.size() > 0
      blockedReasonId: hasClusters ? undefined : 'guide.blocked.needCluster',
    },
    {
      id: 'data-storage',
      titleId: 'guide.step.dataStorage.title',
      descriptionId: 'guide.step.dataStorage.desc',
      required: true,
      complete: activeData.length > 0,
      count: activeData.length,
      action: { kind: 'attach-storage', dataCenterId, storageKind: 'data' },
      actionLabelId: 'guide.step.dataStorage.action',
      // webadmin gates Attach Data Storage on upHosts.size() > 0
      blockedReasonId: hasUpHost ? undefined : 'guide.blocked.needUpHost',
    },
    {
      id: 'iso-storage',
      titleId: 'guide.step.iso.title',
      descriptionId: 'guide.step.iso.desc',
      required: false,
      complete: attachedIso.length > 0,
      count: attachedIso.length,
      action: { kind: 'attach-storage', dataCenterId, storageKind: 'iso' },
      actionLabelId: 'guide.step.iso.action',
      blockedReasonId: hasUpHost ? undefined : 'guide.blocked.needUpHost',
    },
  ]
}

// ── Cluster guide ───────────────────────────────────────────────────────────
// configure hosts → bring a host Up → reach active data storage (through the
// cluster's data center). A cluster with no data center yet cannot reach
// storage, so that step is blocked with the reason webadmin uses.

export function deriveClusterGuide(input: {
  cluster: Cluster
  hosts: Host[]
  storageDomains: StorageDomain[]
}): GuideStep[] {
  const { cluster, hosts, storageDomains } = input
  const clusterHosts = hostsInCluster(hosts, cluster.id)
  const upHosts = clusterHosts.filter(isHostUp)
  const dataCenterId = cluster.data_center?.id
  const activeData = dataCenterId ? attachedActiveDomains(storageDomains, dataCenterId, 'data') : []

  const hasHosts = clusterHosts.length > 0

  return [
    {
      id: 'hosts',
      titleId: 'guide.step.hosts.title',
      descriptionId: 'guide.step.cluster.hosts.desc',
      required: true,
      complete: hasHosts,
      count: clusterHosts.length,
      action: { kind: 'new-host' },
      actionLabelId: 'guide.step.hosts.action',
    },
    {
      id: 'up-host',
      titleId: 'guide.step.upHost.title',
      descriptionId: 'guide.step.upHost.desc',
      required: true,
      complete: upHosts.length > 0,
      count: upHosts.length,
      action: { kind: 'new-host' },
      actionLabelId: 'guide.step.hosts.action',
      blockedReasonId: hasHosts ? undefined : 'guide.blocked.needHost',
    },
    {
      id: 'data-storage',
      titleId: 'guide.step.clusterStorage.title',
      descriptionId: dataCenterId
        ? 'guide.step.clusterStorage.desc.hasDc'
        : 'guide.step.clusterStorage.desc.noDc',
      required: true,
      complete: activeData.length > 0,
      count: activeData.length,
      action: { kind: 'attach-storage', dataCenterId: dataCenterId ?? '', storageKind: 'data' },
      actionLabelId: 'guide.step.clusterStorage.action',
      blockedReasonId: dataCenterId ? undefined : 'guide.blocked.noDc',
    },
  ]
}
