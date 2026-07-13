import { useEffect, useState, type Ref } from 'react'
import {
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  FormGroup,
  MenuToggle,
  Stack,
  StackItem,
  Switch,
  TextInput,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { EllipsisVIcon, MigrationIcon, TimesCircleIcon, TrashIcon } from '@patternfly/react-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import { deleteVm } from '../api/resources/vms'
import { ApiError } from '../api/transport'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'
import { VM_ACTION_LABELS, useVmAction } from '../hooks/useVmActions'
import { canCancelMigration, canRemove } from '../lib/vm-status'
import { useNotify } from '../notifications/context'
import { ChangeCdModalItem } from './ChangeCdModal'
import { RunOnceModalItem } from './RunOnceModal'
import { CloneVmModalItem } from './CloneVmModal'
import { ContextMenu, type ContextMenuPosition } from './context-menu/ContextMenu'
import { ExportOvaModalItem } from './ExportOvaModal'
import { ExportVmModalItem } from './vm-export/ExportVmModal'
import { MigrateVmModal } from './MigrateModal'
import { ConfirmModal } from './ConfirmModal'
import { MakeTemplateModalItem } from './MakeTemplateModal'
import { AssignVmTagsModalItem } from './tags/AssignVmTagsModal'
import { MoveToFolderModalItem } from './tags/MoveToFolderModal'
import { POWER_ACTIONS, type PowerAction } from './vm-power-actions'

// Remove is not a lifecycle action (different endpoint, carries the disk
// choice), so it gets its own mutation instead of extending useVmAction.
function useRemoveVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: ({ vm, detachOnly }: { vm: Vm; detachOnly: boolean }) =>
      deleteVm(vm.id, { detachOnly }),
    onSuccess: (_data, { vm }) => {
      notify({ title: t('vmActions.remove.toast.success', { name: vm.name }), variant: 'success' })
    },
    onError: (error, { vm }) => {
      // The delete-protected item is disabled up front (see below), so a 409
      // here is a race or an in-use conflict. When the engine sends a fault
      // detail, ApiError.message already carries it; when it doesn't (a bare
      // 409, as delete-protection returns), swap the opaque "HTTP 409" for a
      // plain reason + next step.
      const bare409 =
        error instanceof ApiError && error.status === 409 && !error.detail && !error.reason
      notify({
        title: bare409 ? t('vmActions.remove.toast.protected', { name: vm.name }) : error.message,
        variant: 'danger',
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

// includePower=false is for surfaces that already render a dedicated
// VmPowerMenu next to the kebab (the VM detail header) — the kebab then only
// carries the non-lifecycle extras (Move to folder, Remove).
// includeMigrate folds Migrate into the kebab; it defaults false so the
// surfaces that render a standalone MigrateVmButton beside the kebab (VmsPage,
// the VM detail header) don't show it twice — only the combined inventory,
// which dropped that button, opts in.
// contextMenu switches the shell: undefined renders today's kebab untouched;
// set (right-click mode), the SAME DropdownList mounts already open inside a
// cursor-anchored <ContextMenu> at position. Items, gating, order, and the
// sibling modals are identical either way.
export function VmActionsMenu({
  vm,
  includePower = true,
  includeMigrate = false,
  contextMenu,
  tagTargets,
}: {
  vm: Vm
  includePower?: boolean
  includeMigrate?: boolean
  contextMenu?: { position: ContextMenuPosition; onClose: () => void }
  // "Add tag" applies to these VMs instead of just `vm` — the VM views pass
  // the whole multi-selection when this row is part of one
  tagTargets?: readonly Vm[]
}) {
  // context mode mounts open at the cursor; kebab mode waits for its toggle
  const [isOpen, setIsOpen] = useState(contextMenu !== undefined)
  const [confirming, setConfirming] = useState<PowerAction | null>(null)
  // non-null while the remove confirm is up; holds the disk switch state and
  // the typed-name gate (docs/COMPONENTS.md: typed-name confirm for delete)
  const [removing, setRemoving] = useState<{ deleteDisks: boolean; nameInput: string } | null>(null)
  // non-null-toggle while the migrate dialog is up; the dialog is a sibling of
  // the Dropdown so closing the menu never unmounts it (same pattern as the
  // other modal items)
  const [isMigrating, setIsMigrating] = useState(false)
  const mutation = useVmAction()
  const removeMutation = useRemoveVm()
  const t = useT()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // Folder management is admin-tier only — user tier never sees the item.
  const { isAdmin } = useCapabilities()

  // Context-mode full dismissal: the popup closing (item click, Escape,
  // click-away) must not unmount this component while one of its sibling
  // modals is up or a mutation is in flight — the confirm dialogs live here,
  // and the toasts fire from the mutations' useMutation callbacks, which are
  // lost if the component unmounts before the response lands (mock latency is
  // 300ms). Only when the menu is closed AND nothing this component owns is
  // active does the host's onClose run (unmounting via the page's target
  // state). Item-owned modals (Run Once, Change CD, …) instead hold the menu
  // itself open underneath them, so isOpen already covers those.
  useEffect(() => {
    if (contextMenu === undefined || isOpen) return
    if (confirming !== null || removing !== null || isMigrating) return
    if (mutation.isPending || removeMutation.isPending) return
    contextMenu.onClose()
  }, [
    contextMenu,
    isOpen,
    confirming,
    removing,
    isMigrating,
    mutation.isPending,
    removeMutation.isPending,
  ])

  // Items whose predicate fails are hidden, not disabled; the menu is never
  // empty because 'Move to folder…' applies to every status.
  const items = includePower ? POWER_ACTIONS.filter((item) => item.allowed(vm.status)) : []
  // Cancel migration is a kebab-only operation (not a power lifecycle button,
  // so it stays out of POWER_ACTIONS / VmPowerMenu) — surfaced here regardless
  // of includePower so it is reachable from the detail header too. Firing it is
  // non-destructive, so it skips the confirm modal; useVmAction's success toast
  // ("Cancel migration requested for …") is the feedback.
  const showCancelMigration = canCancelMigration(vm.status)
  // Migrate is folded into the kebab on the combined inventory (opt-in via
  // includeMigrate), gated exactly like MigrateVmButton (admin session — GET
  // /hosts needs one — plus a plainly-up VM); when it doesn't apply the item is
  // hidden, not disabled, the same posture as the button.
  const showMigrate = includeMigrate && isAdmin && vm.status === 'up'
  const showRemove = canRemove(vm.status)
  // A delete-protected VM 409s on DELETE. Keep the item visible (so the reason
  // is discoverable) but disabled with a tooltip, rather than letting the user
  // hit the wall — the webadmin behavior.
  const deleteProtected = vm.delete_protected === true

  const select = (item: PowerAction) => {
    setIsOpen(false)
    if (item.confirmBody) {
      setConfirming(item)
    } else {
      mutation.mutate({ vm, action: item.action })
    }
  }

  const remove = (deleteDisks: boolean) => {
    removeMutation.mutate(
      { vm, detachOnly: !deleteDisks },
      {
        onSuccess: () => {
          // viewing the removed VM's details page would just 404-poll — send
          // the user back to the list instead
          if (pathname === `/vms/${vm.id}`) void navigate({ to: '/vms' })
        },
      },
    )
  }

  // Both shells render this one element — same items, RBAC gating, and order —
  // so right-click parity with the kebab can never drift.
  const menuItems = (
    <DropdownList>
      {showCancelMigration && (
        <DropdownItem
          key="cancelmigration"
          icon={<TimesCircleIcon />}
          onClick={() => {
            setIsOpen(false)
            mutation.mutate({ vm, action: 'cancelmigration' })
          }}
        >
          {VM_ACTION_LABELS.cancelmigration}
        </DropdownItem>
      )}
      {items.map((item) => (
        <DropdownItem
          key={item.action}
          icon={item.icon}
          isDanger={item.isDanger}
          tooltipProps={{ content: item.description, position: 'left' }}
          onClick={() => select(item)}
        >
          {VM_ACTION_LABELS[item.action]}
        </DropdownItem>
      ))}
      {showMigrate && (
        <DropdownItem
          key="migrate"
          icon={<MigrationIcon />}
          onClick={() => {
            setIsOpen(false)
            setIsMigrating(true)
          }}
        >
          {t('migrate.action')}
        </DropdownItem>
      )}
      <RunOnceModalItem vm={vm} />
      <ChangeCdModalItem vm={vm} />
      {/* keeps its own modal mounted inside the menu — the dropdown must
          stay open while the folder picker is up (see MoveToFolderModal) */}
      {isAdmin && <MoveToFolderModalItem vm={vm} />}
      {/* manual tags for this VM — or the whole selection on bulk right-click */}
      {isAdmin && <AssignVmTagsModalItem vms={tagTargets ?? [vm]} />}
      <MakeTemplateModalItem vm={vm} />
      <CloneVmModalItem vm={vm} />
      <ExportVmModalItem vm={vm} />
      <ExportOvaModalItem vm={vm} />
      {showRemove && (
        <>
          <Divider component="li" />
          {deleteProtected ? (
            // isAriaDisabled (not isDisabled) keeps the item hoverable so
            // the tooltip shows and it greys out; isDisabled sets
            // pointer-events:none (no tooltip) and isDanger would keep it
            // red (looks enabled). Same pattern as ExportOvaModalItem.
            <DropdownItem
              icon={<TrashIcon />}
              isAriaDisabled
              tooltipProps={{ content: t('vmActions.deleteProtected.tooltip') }}
            >
              <FormattedMessage id="common.action.remove" />
            </DropdownItem>
          ) : (
            <DropdownItem
              icon={<TrashIcon />}
              isDanger
              onClick={() => {
                setIsOpen(false)
                // disk deletion is opt-in — detach-only is the safe default
                setRemoving({ deleteDisks: false, nameInput: '' })
              }}
            >
              <FormattedMessage id="common.action.remove" />
            </DropdownItem>
          )}
        </>
      )}
    </DropdownList>
  )

  return (
    <>
      {contextMenu !== undefined ? (
        <ContextMenu
          position={contextMenu.position}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          ariaLabel={t('common.action.actionsFor', { name: vm.name })}
        >
          {menuItems}
        </ContextMenu>
      ) : (
        <Dropdown
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          popperProps={{ position: 'right' }}
          toggle={(toggleRef: Ref<MenuToggleElement>) => (
            <MenuToggle
              ref={toggleRef}
              aria-label={t('common.action.actionsFor', { name: vm.name })}
              variant="plain"
              icon={<EllipsisVIcon />}
              onClick={() => setIsOpen(!isOpen)}
              isExpanded={isOpen}
              isDisabled={mutation.isPending || removeMutation.isPending}
            />
          )}
        >
          {menuItems}
        </Dropdown>
      )}

      {isMigrating && <MigrateVmModal vm={vm} onClose={() => setIsMigrating(false)} />}

      {confirming && (
        <ConfirmModal
          isOpen
          title={t('vmActions.confirm.title', {
            action: VM_ACTION_LABELS[confirming.action],
            name: vm.name,
          })}
          body={confirming.confirmBody}
          confirmLabel={VM_ACTION_LABELS[confirming.action]}
          onConfirm={() => {
            setConfirming(null)
            mutation.mutate({ vm, action: confirming.action })
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={t('vmActions.remove.confirm.title', { name: vm.name })}
          body={
            <Stack hasGutter>
              <StackItem>
                <FormattedMessage id="vmActions.remove.confirm.body" />
              </StackItem>
              <StackItem>
                <Switch
                  id={`remove-delete-disks-${vm.id}`}
                  label={t('vmActions.remove.deleteDisks')}
                  isChecked={removing.deleteDisks}
                  onChange={(_event, checked) => setRemoving({ ...removing, deleteDisks: checked })}
                />
              </StackItem>
              <StackItem>
                <FormGroup
                  label={t('vmActions.remove.typeToConfirm', { name: vm.name })}
                  isRequired
                  fieldId={`remove-confirm-name-${vm.id}`}
                >
                  <TextInput
                    id={`remove-confirm-name-${vm.id}`}
                    aria-label={t('vmActions.remove.typeToConfirm.aria')}
                    value={removing.nameInput}
                    onChange={(_event, value) => setRemoving({ ...removing, nameInput: value })}
                  />
                </FormGroup>
              </StackItem>
            </Stack>
          }
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={removing.nameInput !== vm.name}
          onConfirm={() => {
            setRemoving(null)
            remove(removing.deleteDisks)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
