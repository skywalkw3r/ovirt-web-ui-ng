import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import { ClusterContextMenu } from '../../components/cluster-actions/ClusterContextMenu'
import type { ContextMenuPosition } from '../../components/context-menu/ContextMenu'
import { DataCenterContextMenu } from '../../components/datacenter-actions/DataCenterContextMenu'
import { HostActionsMenu } from '../../components/host-actions/HostActionsMenu'
import { nodeId, type TreeMenuCtx } from './infraModel'

// The tree's right-click menu, keyed by open-token so re-opening (the same
// node or another) remounts it fresh at the new cursor position. Host nodes
// reuse the dual-mode HostActionsMenu (kebab parity plus Open details);
// cluster/DC nodes get their dedicated menus. Each menu owns its dismissal:
// an open modal or in-flight mutation keeps it mounted until done. The
// snapshot re-resolves against the latest poll data so menu item gating
// tracks live status.
export function InfraTreeMenu({
  target,
  allHosts,
  allClusters,
  dcs,
  onClose,
  onEntityRemoved,
}: {
  target: { position: ContextMenuPosition; ctx: TreeMenuCtx; token: number } | null
  allHosts: Host[]
  allClusters: Cluster[]
  dcs: DataCenter[]
  onClose: () => void
  onEntityRemoved: (node: string) => void
}) {
  if (!target) return null
  const { ctx, position, token } = target
  if (ctx.kind === 'host') {
    const host = allHosts.find((candidate) => candidate.id === ctx.host.id) ?? ctx.host
    // The host's cluster ref may be a bare id stub, so resolve the display name
    // against the clusters inventory (same join the header meta line does) —
    // that name is what shows the Add VM item and seeds the wizard's Cluster
    // field. Unresolvable → no item, rather than a wizard that cannot say
    // which cluster it is creating into.
    const clusterName =
      host.cluster?.name ??
      (host.cluster?.id !== undefined
        ? allClusters.find((candidate) => candidate.id === host.cluster?.id)?.name
        : undefined)
    return (
      <HostActionsMenu
        key={`host-${host.id}-${token}`}
        host={host}
        includeOpenDetails
        addVmClusterName={clusterName}
        contextMenu={{ position, onClose }}
      />
    )
  }
  if (ctx.kind === 'cluster') {
    const cluster = allClusters.find((candidate) => candidate.id === ctx.cluster.id) ?? ctx.cluster
    return (
      <ClusterContextMenu
        key={`cluster-${cluster.id}-${token}`}
        cluster={cluster}
        position={position}
        onClose={onClose}
        onRemoved={() => onEntityRemoved(nodeId('cluster', cluster.id))}
      />
    )
  }
  const dataCenter = dcs.find((candidate) => candidate.id === ctx.dataCenter.id) ?? ctx.dataCenter
  return (
    <DataCenterContextMenu
      key={`datacenter-${dataCenter.id}-${token}`}
      dataCenter={dataCenter}
      position={position}
      onClose={onClose}
      onRemoved={() => onEntityRemoved(nodeId('datacenter', dataCenter.id))}
    />
  )
}
