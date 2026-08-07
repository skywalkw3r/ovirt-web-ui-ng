import { useEffect, useState } from 'react'
import {
  Divider,
  DropdownItem,
  DropdownList,
  FormGroup,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { useNavigate } from '@tanstack/react-router'
import type { DataCenter } from '../../api/schemas/datacenter'
import { useDeleteDataCenter } from '../../hooks/useDataCenterMutations'
import { useT } from '../../i18n/useT'
import { ClusterFormModal } from '../cluster-form/ClusterFormModal'
import { ConfirmModal } from '../ConfirmModal'
import { ContextMenu, type ContextMenuPosition } from '../context-menu/ContextMenu'
import { DataCenterFormModal } from '../datacenter-form/DataCenterFormModal'

// Right-click menu for a data center node in the Hosts & Clusters tree: Open
// details / Edit / Remove. Reuses DataCenterFormModal and useDeleteDataCenter,
// and the Remove confirm carries the data center detail page's typed-name
// confirm copy verbatim, so the two surfaces stay in lockstep. Modal state is
// hoisted here (the modals render as siblings of the menu, not inside its
// items): picking an item closes the menu visually, and the full-dismiss
// effect calls onClose — unmounting the whole component — only once no modal
// is up and no mutation is in flight (the delete toast + onRemoved ride the
// mutation callbacks, which are lost if this unmounts before the response
// lands).
export function DataCenterContextMenu({
  dataCenter,
  position,
  onClose,
  onRemoved,
}: {
  dataCenter: DataCenter
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
  // non-null while the remove confirm is up; holds the typed-name gate
  // (docs/COMPONENTS.md: typed-name confirm for delete)
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  // create-under-this-data-center modal
  const [addingCluster, setAddingCluster] = useState(false)
  const deleteMutation = useDeleteDataCenter()

  const modalActive = editing || removing !== null || addingCluster
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
        ariaLabel={t('common.action.actionsFor', { name: dataCenter.name })}
      >
        <DropdownList>
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              void navigate({
                to: '/datacenters/$dataCenterId',
                params: { dataCenterId: dataCenter.id },
              })
            }}
          >
            {t('infra.openDetails')}
          </DropdownItem>
          <Divider component="li" />
          {/* A level creates its own child and nothing else: a data center
              makes clusters. New host / New VM used to sit here too, but they
              could not name a scope from a DC (it holds many clusters), so
              they opened on their own defaults and made the user pick anyway —
              offering them here only asked the question twice. They live on
              the cluster and host levels, and on the root banner, which stays
              the catch-all. */}
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              setAddingCluster(true)
            }}
          >
            {t('clusters.new')}
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
          <Divider component="li" />
          <DropdownItem
            isDanger
            onClick={() => {
              setIsOpen(false)
              setRemoving({ nameInput: '' })
            }}
          >
            {t('common.action.remove')}
          </DropdownItem>
        </DropdownList>
      </ContextMenu>

      {/* Edit reuses the data center form modal, mounted per open so each
          edit drafts from the freshest entity. */}
      {editing && (
        <DataCenterFormModal dataCenter={dataCenter} isOpen onClose={() => setEditing(false)} />
      )}

      {/* The same create modal the pane banners and the flat lists mount —
          scoped to this DC, which is the whole reason the action belongs at
          this level. */}
      {addingCluster && (
        <ClusterFormModal
          isOpen
          initialDataCenterId={dataCenter.id}
          onClose={() => setAddingCluster(false)}
        />
      )}

      {/* Copy matches DataCenterDetailPage's Remove confirm verbatim (that
          surface hardcodes English; minting new i18n ids is out of scope for
          this menu). Only the field/input DOM ids differ, so the two confirms
          can never collide. */}
      {removing && (
        <ConfirmModal
          isOpen
          title={`Remove ${dataCenter.name}?`}
          body={
            <Stack hasGutter>
              <StackItem>
                The data center will be permanently removed. This cannot be undone.
              </StackItem>
              <StackItem>
                <FormGroup
                  label={`Type "${dataCenter.name}" to confirm`}
                  isRequired
                  fieldId="datacenter-context-remove-confirm-name"
                >
                  <TextInput
                    id="datacenter-context-remove-confirm-name"
                    aria-label="Type the data center name to confirm removal"
                    value={removing.nameInput}
                    onChange={(_event, value) => setRemoving({ nameInput: value })}
                  />
                </FormGroup>
              </StackItem>
            </Stack>
          }
          confirmLabel="Remove"
          isConfirmDisabled={removing.nameInput !== dataCenter.name}
          onConfirm={() => {
            setRemoving(null)
            deleteMutation.mutate(
              { id: dataCenter.id, name: dataCenter.name },
              onRemoved ? { onSuccess: () => onRemoved() } : undefined,
            )
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
