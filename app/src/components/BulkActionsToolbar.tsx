import { useState } from 'react'
import {
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
  Skeleton,
  Stack,
  StackItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { FolderIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import type { VmAction } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { useBulkVmAction } from '../hooks/useBulkVmActions'
import { VM_ACTION_LABELS } from '../hooks/useVmActions'
import { useHosts } from '../hooks/useHosts'
import type { MessageId } from '../i18n/messages/en'
import { useT } from '../i18n/useT'
import { canRestart, canShutdown, canStart, canSuspend } from '../lib/vm-status'
import { ConfirmModal } from './ConfirmModal'
import { MoveToFolderModal } from './tags/MoveToFolderModal'

interface BulkAction {
  action: VmAction
  allowed: (status: string | undefined) => boolean
  // body copy for the confirmation modal — either an i18n id (existing catalog
  // entries) or a hardcoded English string for actions added this wave (the
  // i18n catalogs are read-only). Absent on both means fire immediately.
  confirmBody?: MessageId
  confirmText?: string
}

// Unlike the per-row menu (which hides disallowed items), bulk buttons stay
// visible and disable unless EVERY selected VM's status allows the action —
// a mixed selection should show why nothing is clickable, not reshuffle.
const BULK_ACTIONS: BulkAction[] = [
  { action: 'start', allowed: canStart },
  { action: 'shutdown', allowed: canShutdown, confirmBody: 'bulk.confirm.shutdown' },
  {
    action: 'stop',
    allowed: canShutdown,
    confirmText:
      'Power off forcibly cuts virtual power — the guest OS does not shut down cleanly and unsaved data may be lost.',
  },
  { action: 'reboot', allowed: canRestart, confirmBody: 'bulk.confirm.reboot' },
  { action: 'suspend', allowed: canSuspend },
]

export function BulkActionsToolbar({ selected, onClear }: { selected: Vm[]; onClear: () => void }) {
  const [confirming, setConfirming] = useState<BulkAction | null>(null)
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isMigrateOpen, setIsMigrateOpen] = useState(false)
  const { run, runMigrate, pending } = useBulkVmAction()
  const { isAdmin } = useCapabilities()
  const t = useT()

  if (selected.length === 0) return null

  const select = (item: BulkAction) => {
    if (item.confirmBody || item.confirmText) {
      setConfirming(item)
    } else {
      run(selected, item.action)
    }
  }

  const countLabel = t('bulk.countLabel', { count: selected.length })
  // Migrate needs every selected VM running (the engine rejects a non-up
  // source) and is admin-only, mirroring the single-VM MigrateModal gate.
  const allUp = selected.every((vm) => vm.status === 'up')

  return (
    <>
      <Toolbar aria-label={t('bulk.toolbar.ariaLabel')}>
        <ToolbarContent>
          <ToolbarItem>
            <Label color="blue" onClose={onClear} closeBtnAriaLabel={t('bulk.clear')}>
              {t('bulk.selected', { count: selected.length })}
            </Label>
          </ToolbarItem>
          <ToolbarGroup variant="action-group">
            {BULK_ACTIONS.map((item) => (
              <ToolbarItem key={item.action}>
                <Button
                  variant="secondary"
                  isDisabled={pending || !selected.every((vm) => item.allowed(vm.status))}
                  onClick={() => select(item)}
                >
                  {VM_ACTION_LABELS[item.action]}
                </Button>
              </ToolbarItem>
            ))}
            {isAdmin && (
              <ToolbarItem>
                <Button
                  variant="secondary"
                  isDisabled={pending || !allUp}
                  onClick={() => setIsMigrateOpen(true)}
                >
                  Migrate
                </Button>
              </ToolbarItem>
            )}
            {isAdmin && (
              <ToolbarItem>
                <Button
                  variant="secondary"
                  icon={<FolderIcon />}
                  isDisabled={pending}
                  onClick={() => setIsMoveOpen(true)}
                >
                  <FormattedMessage id="folders.move.item" />
                </Button>
              </ToolbarItem>
            )}
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {isMoveOpen && <MoveToFolderModal vms={selected} onClose={() => setIsMoveOpen(false)} />}

      {isMigrateOpen && (
        <BulkMigrateModal
          vms={selected}
          onMigrate={(hostId) => {
            setIsMigrateOpen(false)
            runMigrate(selected, hostId)
          }}
          onClose={() => setIsMigrateOpen(false)}
        />
      )}

      {confirming && (
        <ConfirmModal
          isOpen
          title={t('bulk.confirm.title', {
            action: VM_ACTION_LABELS[confirming.action],
            countLabel,
          })}
          body={
            <Stack hasGutter>
              <StackItem>
                {confirming.confirmBody ? t(confirming.confirmBody) : confirming.confirmText}
              </StackItem>
              <StackItem>
                <List>
                  {selected.map((vm) => (
                    <ListItem key={vm.id}>{vm.name}</ListItem>
                  ))}
                </List>
              </StackItem>
            </Stack>
          }
          confirmLabel={VM_ACTION_LABELS[confirming.action]}
          onConfirm={() => {
            setConfirming(null)
            run(selected, confirming.action)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}

// Bulk migrate host picker — mirrors the single-VM MigrateModal's auto/pin
// choice over the whole selection (pinning targets one host for every VM, or
// auto lets the scheduler place each). Kept in-toolbar rather than reusing
// MigrateModal directly: that component owns its own single-VM mutation and
// doesn't expose a reusable picker. Hardcoded English (i18n is read-only this
// wave).
function BulkMigrateModal({
  vms,
  onMigrate,
  onClose,
}: {
  vms: Vm[]
  onMigrate: (hostId?: string) => void
  onClose: () => void
}) {
  const hosts = useHosts()
  const [pinHost, setPinHost] = useState(false)
  const [hostId, setHostId] = useState('')

  // Only 'up' hosts can receive a migrating VM — the engine would reject
  // maintenance/non_responsive destinations anyway.
  const targets = (hosts.data ?? []).filter((host) => host.status === 'up')

  const submit = () => {
    if (pinHost && !hostId) return
    onMigrate(pinHost ? hostId : undefined)
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="bulk-migrate-title"
      aria-describedby="bulk-migrate-body"
    >
      <ModalHeader title={`Migrate ${vms.length} virtual machines`} labelId="bulk-migrate-title" />
      <ModalBody id="bulk-migrate-body">
        <Form
          id="bulk-migrate-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup
            label="Destination"
            role="radiogroup"
            isStack
            fieldId="bulk-migrate-destination"
          >
            <Radio
              id="bulk-migrate-destination-auto"
              name="bulk-migrate-destination"
              label="Automatically choose a host"
              description="Let the engine's scheduler place each VM."
              isChecked={!pinHost}
              onChange={() => setPinHost(false)}
            />
            <Radio
              id="bulk-migrate-destination-pinned"
              name="bulk-migrate-destination"
              label="Select a destination host"
              isChecked={pinHost}
              onChange={() => setPinHost(true)}
            />
          </FormGroup>

          {pinHost && (
            <FormGroup label="Host" isRequired fieldId="bulk-migrate-host">
              {hosts.isPending && <Skeleton height="2.25rem" screenreaderText="Loading hosts" />}
              {hosts.isError && (
                <HelperText>
                  <HelperTextItem variant="error">
                    Could not load hosts:{' '}
                    {hosts.error instanceof Error ? hosts.error.message : 'Unknown error'}
                  </HelperTextItem>
                </HelperText>
              )}
              {hosts.isSuccess && (
                <FormSelect
                  id="bulk-migrate-host"
                  aria-label="Host"
                  value={hostId}
                  onChange={(_event, value) => setHostId(value)}
                >
                  <FormSelectOption
                    value=""
                    label={targets.length === 0 ? 'No available hosts' : 'Select a host'}
                    isPlaceholder
                    isDisabled
                  />
                  {targets.map((host) => (
                    <FormSelectOption key={host.id} value={host.id} label={host.name} />
                  ))}
                </FormSelect>
              )}
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="bulk-migrate-form"
          isDisabled={pinHost && !hostId}
        >
          Migrate
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
