import { useState, type Ref } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Stack,
  StackItem,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { EllipsisVIcon } from '@patternfly/react-icons'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { ConfirmModal } from '../ConfirmModal'
import {
  useActivateStorageDomain,
  useDeactivateStorageDomain,
  useDetachStorageDomain,
} from '../../hooks/useStorageDomainMutations'
import {
  refreshStorageDomainLuns,
  updateStorageDomainOvfStore,
} from '../../api/resources/storageDomains'
import { useNotify } from '../../notifications/context'
import { useT } from '../../i18n/useT'
import { AttachStorageDomainModal } from './AttachStorageDomainModal'
import { DestroyStorageDomainModal } from './DestroyStorageDomainModal'
import { EditStorageDomainModal } from './EditStorageDomainModal'
import { ExtendStorageDomainModal } from './ExtendStorageDomainModal'
import { ReduceLunsModal } from './ReduceLunsModal'
import { RemoveStorageDomainModal } from './RemoveStorageDomainModal'
import {
  DISABLED_REASONS,
  attachedDataCenterId,
  canActivate,
  canAttach,
  canDetach,
  canExtendLuns,
  canMaintenance,
  canReduceLuns,
  canRefreshLuns,
  canRemove,
  canUpdateOvfs,
} from './lifecycle'

// Which dialog (if any) is currently open. Only one lifecycle dialog is up at a
// time, so a single discriminant is clearer than a boolean per modal.
type OpenDialog = 'edit' | 'attach' | 'remove' | 'destroy' | 'extendLuns' | 'reduceLuns' | null

// Which inline confirm (if any) is up. Maintenance, Detach, Update OVFs and
// Refresh LUNs are simple yes/no gates, so they ride the shared ConfirmModal
// rather than their own file.
type OpenConfirm = 'maintenance' | 'detach' | 'updateOvfs' | 'refreshLuns' | null

// The storage-domain lifecycle action menu — the single kebab both the list row
// and the detail header render, so the two entry points can never drift. Items
// are ALWAYS shown; a gated item is disabled (isAriaDisabled) with a tooltip
// naming the precondition, so the admin learns why rather than facing a dead
// menu. Ordered as webadmin's StorageDataCenterActionPanel: Manage, Activate,
// Maintenance, Detach, Attach, Remove, Destroy.
//
// The data-center-scoped actions (Activate, Maintenance, Detach) POST against
// the domain's attached data center; its id comes from the inlined
// data_centers link (attachedDataCenterId). An attached domain always has one —
// but if it is somehow absent, the item is disabled defensively so we never
// fire a request with an undefined dc id.
export function StorageDomainActions({
  domain,
  onRemoved,
}: {
  domain: StorageDomain
  // Fired after a Remove or Destroy succeeds so the detail page can navigate
  // back to the list; the list page omits it and relies on the row dropping.
  onRemoved?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [confirm, setConfirm] = useState<OpenConfirm>(null)

  const t = useT()
  const { notify } = useNotify()
  const queryClient = useQueryClient()

  const activate = useActivateStorageDomain()
  const deactivate = useDeactivateStorageDomain()
  const detach = useDetachStorageDomain()

  // Update OVFs and Refresh LUNs POST straight against the domain (no DC id in
  // the path), so they run as one-shot mutations here rather than through the
  // DC-scoped hooks in useStorageDomainMutations. Both settle-only; on settle we
  // refresh the domain (list + detail slices) — Refresh LUNs can change
  // available/used, and either way a re-read costs nothing. Success text and the
  // engine-verbatim error ride the shared notify() toast, same as the hooks.
  const invalidateDomain = () => {
    void queryClient.invalidateQueries({ queryKey: ['storagedomains'] })
    void queryClient.invalidateQueries({ queryKey: ['storagedomain', domain.id] })
  }
  const updateOvfs = useMutation({
    mutationFn: () => updateStorageDomainOvfStore(domain.id),
    onSuccess: () =>
      notify({ title: t('storage.updateOvfs.success', { name: domain.name }), variant: 'success' }),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidateDomain,
  })
  const refreshLuns = useMutation({
    mutationFn: () => refreshStorageDomainLuns(domain.id),
    onSuccess: () =>
      notify({
        title: t('storage.refreshLuns.success', { name: domain.name }),
        variant: 'success',
      }),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: invalidateDomain,
  })

  const dcId = attachedDataCenterId(domain)
  const busy =
    activate.isPending ||
    deactivate.isPending ||
    detach.isPending ||
    updateOvfs.isPending ||
    refreshLuns.isPending

  const attachEnabled = canAttach(domain)
  const activateEnabled = canActivate(domain) && dcId !== undefined
  const maintenanceEnabled = canMaintenance(domain) && dcId !== undefined
  const detachEnabled = canDetach(domain) && dcId !== undefined
  const updateOvfsEnabled = canUpdateOvfs(domain)
  const refreshLunsEnabled = canRefreshLuns(domain)
  const extendLunsEnabled = canExtendLuns(domain)
  const reduceLunsEnabled = canReduceLuns(domain)
  const removeEnabled = canRemove(domain)

  // Close the menu, then run the follow-up (open a dialog / fire a mutation).
  const pick = (run: () => void) => {
    setIsOpen(false)
    run()
  }

  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        popperProps={{ position: 'right' }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            aria-label={`Actions for ${domain.name}`}
            variant="plain"
            icon={<EllipsisVIcon />}
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            isDisabled={busy}
          />
        )}
      >
        <DropdownList>
          <DropdownItem onClick={() => pick(() => setDialog('edit'))}>Manage domain</DropdownItem>

          <DropdownItem
            isAriaDisabled={!activateEnabled}
            tooltipProps={
              activateEnabled ? undefined : { content: DISABLED_REASONS.activate, position: 'left' }
            }
            onClick={() =>
              pick(
                () =>
                  dcId !== undefined &&
                  activate.mutate({
                    dataCenterId: dcId,
                    storageDomainId: domain.id,
                    name: domain.name,
                  }),
              )
            }
          >
            Activate
          </DropdownItem>

          <DropdownItem
            isAriaDisabled={!maintenanceEnabled}
            tooltipProps={
              maintenanceEnabled
                ? undefined
                : { content: DISABLED_REASONS.maintenance, position: 'left' }
            }
            onClick={() => pick(() => setConfirm('maintenance'))}
          >
            Maintenance
          </DropdownItem>

          <DropdownItem
            isAriaDisabled={!detachEnabled}
            tooltipProps={
              detachEnabled ? undefined : { content: DISABLED_REASONS.detach, position: 'left' }
            }
            onClick={() => pick(() => setConfirm('detach'))}
          >
            Detach
          </DropdownItem>

          <DropdownItem
            isAriaDisabled={!attachEnabled}
            tooltipProps={
              attachEnabled ? undefined : { content: DISABLED_REASONS.attach, position: 'left' }
            }
            onClick={() => pick(() => setDialog('attach'))}
          >
            Attach to data center
          </DropdownItem>

          <DropdownItem
            isAriaDisabled={!updateOvfsEnabled}
            tooltipProps={
              updateOvfsEnabled
                ? undefined
                : { content: DISABLED_REASONS.updateOvfs, position: 'left' }
            }
            onClick={() => pick(() => setConfirm('updateOvfs'))}
          >
            {t('storage.action.updateOvfs')}
          </DropdownItem>

          <DropdownItem
            isAriaDisabled={!refreshLunsEnabled}
            tooltipProps={
              refreshLunsEnabled
                ? undefined
                : { content: DISABLED_REASONS.refreshLuns, position: 'left' }
            }
            onClick={() => pick(() => setConfirm('refreshLuns'))}
          >
            {t('storage.action.refreshLuns')}
          </DropdownItem>

          <DropdownItem
            isAriaDisabled={!extendLunsEnabled}
            tooltipProps={
              extendLunsEnabled
                ? undefined
                : { content: DISABLED_REASONS.extendLuns, position: 'left' }
            }
            onClick={() => pick(() => setDialog('extendLuns'))}
          >
            Add LUNs (extend)
          </DropdownItem>

          <DropdownItem
            isAriaDisabled={!reduceLunsEnabled}
            tooltipProps={
              reduceLunsEnabled
                ? undefined
                : { content: DISABLED_REASONS.reduceLuns, position: 'left' }
            }
            onClick={() => pick(() => setDialog('reduceLuns'))}
          >
            Remove LUNs (reduce)
          </DropdownItem>

          <DropdownItem
            // danger styling only while actionable — isAriaDisabled greys it out
            // when removal isn't allowed (isDanger would otherwise keep it red)
            isDanger={removeEnabled}
            isAriaDisabled={!removeEnabled}
            tooltipProps={
              removeEnabled ? undefined : { content: DISABLED_REASONS.remove, position: 'left' }
            }
            onClick={() => pick(() => setDialog('remove'))}
          >
            Remove
          </DropdownItem>

          {/* Destroy is never status-gated — it is the last-resort DB purge for
              an unreachable domain, behind a typed-name confirm. */}
          <DropdownItem isDanger onClick={() => pick(() => setDialog('destroy'))}>
            Destroy
          </DropdownItem>
        </DropdownList>
      </Dropdown>

      {dialog === 'edit' && (
        <EditStorageDomainModal domain={domain} isOpen onClose={() => setDialog(null)} />
      )}
      {dialog === 'attach' && (
        <AttachStorageDomainModal domain={domain} isOpen onClose={() => setDialog(null)} />
      )}
      {dialog === 'extendLuns' && (
        <ExtendStorageDomainModal domain={domain} isOpen onClose={() => setDialog(null)} />
      )}
      {dialog === 'reduceLuns' && (
        <ReduceLunsModal domain={domain} isOpen onClose={() => setDialog(null)} />
      )}
      {dialog === 'remove' && (
        <RemoveStorageDomainModal
          domain={domain}
          isOpen
          onClose={() => setDialog(null)}
          onRemoved={onRemoved}
        />
      )}
      {dialog === 'destroy' && (
        <DestroyStorageDomainModal
          domain={domain}
          isOpen
          onClose={() => setDialog(null)}
          onDestroyed={onRemoved}
        />
      )}

      {confirm === 'maintenance' && dcId !== undefined && (
        <ConfirmModal
          isOpen
          title={`Move ${domain.name} to maintenance?`}
          confirmLabel="Move to maintenance"
          body={
            <Stack hasGutter>
              <StackItem>
                Virtual machines with disks on this domain lose access to that storage while it is
                in maintenance. Make sure nothing critical is running against it first.
              </StackItem>
            </Stack>
          }
          onConfirm={() => {
            setConfirm(null)
            deactivate.mutate({
              dataCenterId: dcId,
              storageDomainId: domain.id,
              name: domain.name,
            })
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'detach' && dcId !== undefined && (
        <ConfirmModal
          isOpen
          title={`Detach ${domain.name}?`}
          confirmLabel="Detach"
          body={
            <Stack hasGutter>
              <StackItem>
                The domain leaves this data center but its data is kept — you can reattach it later.
              </StackItem>
            </Stack>
          }
          onConfirm={() => {
            setConfirm(null)
            detach.mutate({ dataCenterId: dcId, storageDomainId: domain.id, name: domain.name })
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'updateOvfs' && (
        <ConfirmModal
          isOpen
          title={t('storage.updateOvfs.confirm.title', { name: domain.name })}
          confirmLabel={t('storage.action.updateOvfs')}
          body={
            <Stack hasGutter>
              <StackItem>{t('storage.updateOvfs.confirm.body')}</StackItem>
            </Stack>
          }
          onConfirm={() => {
            setConfirm(null)
            updateOvfs.mutate()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'refreshLuns' && (
        <ConfirmModal
          isOpen
          title={t('storage.refreshLuns.confirm.title', { name: domain.name })}
          confirmLabel={t('storage.action.refreshLuns')}
          body={
            <Stack hasGutter>
              <StackItem>{t('storage.refreshLuns.confirm.body')}</StackItem>
            </Stack>
          }
          onConfirm={() => {
            setConfirm(null)
            refreshLuns.mutate()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
