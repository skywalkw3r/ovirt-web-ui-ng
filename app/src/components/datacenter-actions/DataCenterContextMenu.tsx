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
import { NewHostModal } from '../host-form/NewHostModal'
import { CreateVmWizardModal } from '../vm-create/CreateVmWizard'

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
  // create-under-this-data-center modals
  const [addingCluster, setAddingCluster] = useState(false)
  const [addingHost, setAddingHost] = useState(false)
  const [addingVm, setAddingVm] = useState(false)
  const deleteMutation = useDeleteDataCenter()

  const modalActive = editing || removing !== null || addingCluster || addingHost || addingVm
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
          {/* Create what can live under a data center — the same three verbs
              this DC's banner offers. Only New cluster can name its scope from
              here: a DC holds many clusters, so New host and Add VM open on
              their own defaults and let the user pick (see the modals'
              initial-scope props). */}
          <DropdownItem
            onClick={() => {
              setIsOpen(false)
              setAddingCluster(true)
            }}
          >
            {t('clusters.new')}
          </DropdownItem>
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

      {/* The same create modals the pane banners and the flat lists mount. */}
      {addingCluster && (
        <ClusterFormModal
          isOpen
          initialDataCenterId={dataCenter.id}
          onClose={() => setAddingCluster(false)}
        />
      )}

      {addingHost && <NewHostModal isOpen onClose={() => setAddingHost(false)} />}

      {addingVm && <CreateVmWizardModal onClose={() => setAddingVm(false)} />}

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
