import { useMemo } from 'react'
import type { TreeViewDataItem } from '@patternfly/react-core'
import { ClusterIcon, InfrastructureIcon } from '@patternfly/react-icons'
import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import { ClusterHealthBadge } from '../../components/ClusterHealthBadge'
import { HostedEngineCrown } from '../../components/HostedEngineCrown'
import { useT } from '../../i18n/useT'
import { HostTreeIcon } from './HostTreeIcon'
import { ROOT_ID, byName, nodeId } from './infraModel'

// The PF TreeView data for the infrastructure navigator, filtered by the
// toolbar's name needle. A cluster/host survives when its own name matches or
// (for containers) when any descendant matches, so the hierarchy stays
// walkable while narrowing. Empty needle = everything.
//
// The whole tree is derived data — memoized so poll ticks whose payloads
// didn't change (structural sharing keeps the array identities) and unrelated
// state changes skip the rebuild.
export function useInfraTreeData({
  dcs,
  allClusters,
  hostsByCluster,
  needle,
}: {
  dcs: DataCenter[]
  allClusters: Cluster[]
  hostsByCluster: Map<string, Host[]>
  needle: string
}): TreeViewDataItem[] {
  const t = useT()
  return useMemo<TreeViewDataItem[]>(() => {
    const nameMatches = (name: string | undefined) =>
      needle === '' || (name ?? '').toLowerCase().includes(needle)

    const hostItem = (host: Host): TreeViewDataItem => {
      const hostedEngine = host.hosted_engine
      const isHe = hostedEngine?.active === true || hostedEngine?.configured === true
      return {
        id: nodeId('host', host.id),
        // The crown leads the name for hosted-engine hosts (right after the
        // tree's status icon, so the markers align down the tree); ordinary
        // hosts keep the plain string inside the same marked span. The span's
        // data-infra-ctx feeds the tree-level right-click delegation
        // (onTreeContextMenu), so the menu opens from anywhere on the row.
        // The tree's name filter reads host.name directly, so the JSX here
        // never affects search.
        name: isHe ? (
          <span
            data-infra-ctx={nodeId('host', host.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            <HostedEngineCrown hostedEngine={hostedEngine} hostId={host.id} />
            {host.name}
          </span>
        ) : (
          <span data-infra-ctx={nodeId('host', host.id)}>{host.name}</span>
        ),
        icon: <HostTreeIcon status={host.status} />,
      }
    }

    const clusterItem = (cluster: Cluster): TreeViewDataItem | null => {
      const allClusterHosts = hostsByCluster.get(cluster.id) ?? []
      const clusterHosts = allClusterHosts
        .filter((host) => nameMatches(cluster.name) || nameMatches(host.name))
        .sort(byName)
      if (!nameMatches(cluster.name) && clusterHosts.length === 0) return null
      return {
        id: nodeId('cluster', cluster.id),
        // The health badge trails the name (leading it would ragged-edge the
        // cluster names against each other) and reads the cluster's *whole*
        // host set, not the name-filtered subset — a filter narrows what you
        // see, it must not talk you out of a warning.
        name: (
          <span
            data-infra-ctx={nodeId('cluster', cluster.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            {cluster.name}
            <ClusterHealthBadge hosts={allClusterHosts} />
          </span>
        ),
        icon: <ClusterIcon />,
        // Collapsed by default (large host estates); auto-open while filtering
        // so search reveals matching hosts inside.
        defaultExpanded: needle !== '',
        children: clusterHosts.length > 0 ? clusterHosts.map(hostItem) : undefined,
      }
    }

    const dcItem = (dc: DataCenter): TreeViewDataItem | null => {
      const dcClusters = allClusters
        .filter((cluster) => cluster.data_center?.id === dc.id)
        .sort(byName)
      const children = dcClusters
        .map(clusterItem)
        .filter((item): item is TreeViewDataItem => item !== null)
      if (!nameMatches(dc.name) && children.length === 0) return null
      return {
        id: nodeId('datacenter', dc.id),
        name: <span data-infra-ctx={nodeId('datacenter', dc.id)}>{dc.name}</span>,
        icon: <InfrastructureIcon />,
        defaultExpanded: needle !== '',
        children: children.length > 0 ? children : undefined,
      }
    }

    return [
      {
        id: ROOT_ID,
        name: t('infra.tree.allLabel'),
        defaultExpanded: true,
        children:
          dcs.length > 0
            ? [...dcs]
                .sort(byName)
                .map(dcItem)
                .filter((item): item is TreeViewDataItem => item !== null)
            : undefined,
      },
    ]
  }, [dcs, allClusters, hostsByCluster, needle, t])
}
