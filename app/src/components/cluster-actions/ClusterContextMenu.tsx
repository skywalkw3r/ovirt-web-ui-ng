import { useEffect, useState } from 'react'
import { Divider, DropdownItem, DropdownList } from '@patternfly/react-core'
import { useNavigate } from '@tanstack/react-router'
import type { Cluster } from '../../api/schemas/cluster'
import { useDeleteCluster } from '../../hooks/useClusterMutations'
import { useT } from '../../i18n/useT'
import { ClusterFormModal } from '../cluster-form/ClusterFormModal'
import { ClusterUpgradeModal } from '../cluster-upgrade/ClusterUpgradeModal'
import { ContextMenu, type ContextMenuPosition } from '../context-menu/ContextMenu'
import { NewHostModal } from '../host-form/NewHostModal'
import { CreateVmWizardModal } from '../vm-create/CreateVmWizard'
import { RemoveClusterConfirm } from './RemoveClusterConfirm'

// Right-click menu for a cluster node in the Hosts & Clusters tree: Open
// details / Edit / Upgrade / Remove — ClusterActionsBar's verb set plus
// navigation, reusing the same modals, confirm copy, and delete mutation so
// gating and toasts stay identical. Modal state is hoisted here (the modals
// render as siblings of the menu, not inside its items): picking an item
// closes the menu visually, and the full-dismiss effect calls onClose —
// unmounting the whole component — only once no modal is up and no mutation
// is in flight (the delete toast + onRemoved ride the mutation callbacks,
// which are lost if this unmounts before the response lands).
export function ClusterContextMenu({
  cluster,
  position,
  onClose,
  onRemoved,
}: {
  cluster: Cluster
  position: ContextMenuPosition
  onClose: () => void
  // fires after a successful remove — the tree clears a matching selection
  onRemoved?: () => void
}) {
  const t = useT()
  const navigate = useNavigate()
  // mounts open at the cursor; the host keys the component by open-token
  const [isOpen, setIsOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  // true while the typed-name remove confirm is up (the gate itself lives in
  // RemoveClusterConfirm, shared with ClusterActionsBar)
  const [removing, setRemoving] = useState(false)
  // create-under-this-cluster modals, both scoped to it
  const [addingHost, setAddingHost] = useState(false)
  const [addingVm, setAddingVm] = useState(false)
  const deleteMutation = useDeleteCluster()

  const modalActive = editing || upgrading || removing || addingHost || addingVm
  useEffect(() => {
    if (isOpen || modalActive || deleteMutation.isPending) return
    onClose()
  }, [isOpen, modalActive, deleteMutation.isPending, onClose])

  return (
    <>
      <ContextMenu
        position={position}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        ariaLabel={t('common.action.actionsFor', { name: cluster.name })}
      >
        <DropdownList>
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              void navigate({ to: '/clusters/$clusterId', params: { clusterId: cluster.id } })
            }}
          >
            {t('infra.openDetails')}
          </DropdownItem>
          <Divider component="li" />
          {/* Create what can live under a cluster, scoped to this one — the
              same two verbs the cluster's banner offers, so the tree and the
              banner never drift. */}
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              setAddingHost(true)
            }}
          >
            {t('hosts.new')}
          </DropdownItem>
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              setAddingVm(true)
            }}
          >
            {t('vms.new')}
          </DropdownItem>
          <Divider component="li" />
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              setEditing(true)
            }}
          >
            {t('common.action.edit')}
          </DropdownItem>
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              setUpgrading(true)
            }}
          >
            {t('clusterUpgrade.action')}
          </DropdownItem>
          <Divider component="li" />
          <DropdownItem
            isDanger
            onClick={() => {
              setIsOpen(false)
              setRemoving(true)
            }}
          >
            {t('common.action.remove')}
          </DropdownItem>
        </DropdownList>
      </ContextMenu>

      {/* Edit reuses the cluster form modal, mounted per open so each edit
          drafts from the freshest cluster. */}
      {editing && <ClusterFormModal cluster={cluster} isOpen onClose={() => setEditing(false)} />}

      {/* Both create modals are the same ones the flat lists and the pane
          banners mount — only the preselected scope differs. */}
      {addingHost && (
        <NewHostModal isOpen initialClusterId={cluster.id} onClose={() => setAddingHost(false)} />
      )}

      {addingVm && (
        <CreateVmWizardModal initialClusterName={cluster.name} onClose={() => setAddingVm(false)} />
      )}

      {upgrading && (
        <ClusterUpgradeModal
          clusterId={cluster.id}
          clusterName={cluster.name}
          onClose={() => setUpgrading(false)}
        />
      )}

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
