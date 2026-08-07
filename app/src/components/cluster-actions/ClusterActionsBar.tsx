import { useState } from 'react'
import { Button, Flex, FlexItem } from '@patternfly/react-core'
import type { Cluster } from '../../api/schemas/cluster'
import { useT } from '../../i18n/useT'
import { ClusterFormModal } from '../cluster-form/ClusterFormModal'
import { ClusterUpgradeModal } from '../cluster-upgrade/ClusterUpgradeModal'
import { useDeleteCluster } from '../../hooks/useClusterMutations'
import { RemoveClusterConfirm } from './RemoveClusterConfirm'

// The cluster verb row shared by the Hosts & Clusters tree (cluster node) and
// the cluster detail header: Upgrade (rolling ClusterUpgradeModal) / Edit
// (ClusterFormModal) / Remove (typed-name RemoveClusterConfirm, shared with
// the tree's right-click ClusterContextMenu). It owns its three modals so a
// caller only drops in the bar. `onRemoved` fires after a successful delete —
// the detail page navigates away, the tree clears its selection. ClustersPage
// keeps its own per-row kebab (a different surface).
export function ClusterActionsBar({
  cluster,
  onRemoved,
}: {
  cluster: Cluster
  onRemoved?: () => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  // true while the typed-name remove confirm is up (the gate itself lives in
  // RemoveClusterConfirm)
  const [removing, setRemoving] = useState(false)
  const deleteMutation = useDeleteCluster()

  return (
    <>
      <Flex spaceItems={{ default: 'spaceItemsSm' }}>
        <FlexItem>
          <Button variant="secondary" onClick={() => setUpgrading(true)}>
            {t('clusterUpgrade.action')}
          </Button>
        </FlexItem>
        <FlexItem>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t('common.action.edit')}
          </Button>
        </FlexItem>
        <FlexItem>
          <Button
            variant="secondary"
            isDanger
            isDisabled={deleteMutation.isPending}
            onClick={() => setRemoving(true)}
          >
            {t('common.action.remove')}
          </Button>
        </FlexItem>
      </Flex>

      {/* Edit reuses the cluster form modal, mounted so each open starts fresh. */}
      <ClusterFormModal cluster={cluster} isOpen={editing} onClose={() => setEditing(false)} />

      {upgrading && (
        <ClusterUpgradeModal
          clusterId={cluster.id}
          clusterName={cluster.name}
          onClose={() => setUpgrading(false)}
        />
      )}

      {/* Typed-name destructive confirm (docs/COMPONENTS.md: typed-name confirm
          for delete). Copy mirrors ClustersPage / ClusterDetailPage via the
          shared clusters.remove.confirm.* ids. */}
      {removing && (
        <RemoveClusterConfirm
          cluster={cluster}
          onConfirm={() => {
            setRemoving(false)
            deleteMutation.mutate(
              { id: cluster.id, name: cluster.name },
              onRemoved ? { onSuccess: () => onRemoved() } : undefined,
            )
          }}
          onCancel={() => setRemoving(false)}
        />
      )}
    </>
  )
}
