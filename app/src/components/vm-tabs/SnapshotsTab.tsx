import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  AlertActionLink,
  Button,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Switch,
  TextInput,
  Timestamp,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { StatusBadge } from '../StatusBadge'
import { cloneVmFromSnapshot } from '../../api/resources/snapshots'
import type { DiskAttachment } from '../../api/schemas/disk'
import type { Snapshot } from '../../api/schemas/snapshot'
import {
  useCommitSnapshot,
  usePreviewSnapshot,
  useUndoSnapshot,
} from '../../hooks/useSnapshotPreview'
import {
  useCreateSnapshot,
  useDeleteSnapshot,
  useRestoreSnapshot,
  useSnapshots,
} from '../../hooks/useSnapshots'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { useNow } from '../../hooks/useNow'
import { useVm } from '../../hooks/useVm'
import { useVmDisks } from '../../hooks/useVmStorage'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { formatBytes, statusText } from '../../lib/format'
import { useNotify } from '../../notifications/context'
import { vmNameError } from '../edit-vm/editVmDraft'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { ConfirmModal } from '../ConfirmModal'

// Clone-from-snapshot's save mutation. POST /vms (Add.FromSnapshot) rebuilds a
// new VM from the snapshot's configuration; the toast mirrors useCloneVm's
// "is being created" (the clone rides image_locked while the engine copies the
// disks) and the ['vms'] invalidation surfaces it in every VM list. Toast
// strings are hardcoded English by project convention.
function useCloneVmFromSnapshot() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: { name: string; snapshotId: string; clusterId: string }) =>
      cloneVmFromSnapshot(spec),
    onSuccess: (_vm, { name }) => {
      notify({ title: `Clone ${name} is being created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

const STATUS_COLOR: Record<string, 'green' | 'blue' | 'yellow'> = {
  ok: 'green',
  locked: 'blue',
  in_preview: 'yellow',
}

// PF Timestamp has no built-in relative mode — custom children override the
// display while the default tooltip keeps the full UTC date reachable.
const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function relativeTime(epochMs: number, now: number): string {
  const delta = epochMs - now
  for (const [unit, ms] of RELATIVE_STEPS) {
    if (Math.abs(delta) >= ms) return relativeFormat.format(Math.round(delta / ms), unit)
  }
  return relativeFormat.format(0, 'second')
}

function snapshotName(snapshot: Snapshot): string {
  return snapshot.description ?? snapshot.id
}

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Description pinned as the identity column). Labels resolve per-locale in the
// component; headers and cells both map over the same isVisible-filtered array
// so they can never desync. The actions kebab renders unconditionally outside
// the pickable set. Snapshots keep the engine's list order (the 'active'
// snapshot rides at the top and its kebab is hidden), so no header sort is
// wired.
const COLUMNS: {
  key: string
  labelId: MessageId
  always?: boolean
}[] = [
  { key: 'description', labelId: 'common.field.description', always: true },
  { key: 'type', labelId: 'common.field.type' },
  { key: 'status', labelId: 'common.field.status' },
  { key: 'created', labelId: 'vmSnapshots.column.created' },
  { key: 'memory', labelId: 'vmSnapshots.column.memory' },
]

type ConfirmAction = 'restore' | 'delete' | 'preview' | 'commit' | 'undo'

export function SnapshotsTab({ vmId }: { vmId: string }) {
  const t = useT()
  const confirmCopy: Record<ConfirmAction, { label: string; body: string }> = {
    restore: {
      label: t('vmSnapshots.action.restore'),
      body: t('vmSnapshots.confirm.restore.body'),
    },
    delete: {
      label: t('common.action.delete'),
      body: t('vmSnapshots.confirm.delete.body'),
    },
    preview: {
      label: t('vmSnapshots.action.preview'),
      body: t('vmSnapshots.confirm.preview.body'),
    },
    commit: {
      label: t('vmSnapshots.preview.commit'),
      body: t('vmSnapshots.confirm.commit.body'),
    },
    undo: {
      label: t('vmSnapshots.preview.undo'),
      body: t('vmSnapshots.confirm.undo.body'),
    },
  }
  const snapshots = useSnapshots(vmId)
  const vm = useVm(vmId)
  const now = useNow(30_000)
  const create = useCreateSnapshot(vmId)
  const restore = useRestoreSnapshot(vmId)
  const remove = useDeleteSnapshot(vmId)
  const preview = usePreviewSnapshot(vmId)
  const commit = useCommitSnapshot(vmId)
  const undo = useUndoSnapshot(vmId)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [confirming, setConfirming] = useState<{
    action: ConfirmAction
    snapshot: Snapshot
  } | null>(null)
  // non-null while the Clone-from-snapshot dialog is open (its target snapshot)
  const [cloning, setCloning] = useState<Snapshot | null>(null)

  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('vm-snapshots', columns)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  const mutating =
    create.isPending ||
    restore.isPending ||
    remove.isPending ||
    preview.isPending ||
    commit.isPending ||
    undo.isPending

  // The preview lifecycle only runs on a powered-off VM (engine constraint).
  const isDown = vm.data?.status === 'down'
  const previewing = (snapshots.data ?? []).find(
    (snapshot) => snapshot.snapshot_status === 'in_preview',
  )

  // Webadmin (VmSnapshotListModel.updateActionAvailability) refuses to create
  // a snapshot while another is locked or previewed, or while the VM image is
  // locked — firing anyway just bounces off the engine with a raw fault.
  const anyLocked = (snapshots.data ?? []).some((snapshot) => snapshot.snapshot_status === 'locked')
  const createBlockedReason =
    previewing !== undefined
      ? t('vmSnapshots.blocked.preview')
      : anyLocked
        ? t('vmSnapshots.blocked.locked')
        : vm.data?.status === 'image_locked'
          ? t('vmSnapshots.blocked.imageLocked')
          : undefined

  // Webadmin's clone-command availability (VmSnapshotListModel: !isLocked &&
  // !isPreviewing && !isVmImageLocked): only settled regular snapshots clone.
  // The active snapshot never reaches here — its kebab is hidden below.
  const cloneBlockedReason = (snapshot: Snapshot): string | undefined =>
    snapshot.snapshot_status === 'locked'
      ? t('vmSnapshots.blocked.locked')
      : previewing !== undefined
        ? t('vmSnapshots.blocked.preview')
        : vm.data?.status === 'image_locked'
          ? t('vmSnapshots.blocked.imageLocked')
          : undefined

  const cellOf = (snapshot: Snapshot, key: string): ReactNode => {
    switch (key) {
      case 'description':
        return snapshot.description || '—'
      case 'type':
        return statusText(snapshot.snapshot_type)
      case 'status':
        return (
          <StatusBadge color={STATUS_COLOR[snapshot.snapshot_status ?? ''] ?? 'grey'}>
            {statusText(snapshot.snapshot_status ?? 'unknown')}
          </StatusBadge>
        )
      case 'created':
        return snapshot.date !== undefined ? (
          <Timestamp date={new Date(snapshot.date)} tooltip={{ variant: 'default' }}>
            {relativeTime(snapshot.date, now)}
          </Timestamp>
        ) : (
          '—'
        )
      case 'memory':
        return snapshot.persist_memorystate ? t('common.yes') : t('common.no')
      default:
        return '—'
    }
  }

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            {createBlockedReason !== undefined ? (
              // isAriaDisabled keeps the button hoverable/focusable so the
              // tooltip explaining why it is disabled can show.
              <Tooltip content={createBlockedReason}>
                <Button variant="primary" isAriaDisabled>
                  {t('vmSnapshots.create')}
                </Button>
              </Tooltip>
            ) : (
              <Button variant="primary" onClick={() => setIsCreateOpen(true)} isDisabled={mutating}>
                {t('vmSnapshots.create')}
              </Button>
            )}
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {previewing && (
        <Alert
          variant="warning"
          isInline
          title={t('vmSnapshots.preview.alert.title', { name: snapshotName(previewing) })}
          style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
          actionLinks={
            <>
              <AlertActionLink
                onClick={() => setConfirming({ action: 'commit', snapshot: previewing })}
                isDisabled={!isDown || mutating}
              >
                {t('vmSnapshots.preview.commit')}
              </AlertActionLink>
              <AlertActionLink
                onClick={() => setConfirming({ action: 'undo', snapshot: previewing })}
                isDisabled={!isDown || mutating}
              >
                {t('vmSnapshots.preview.undo')}
              </AlertActionLink>
            </>
          }
        >
          {!isDown && t('vmSnapshots.preview.powerOff')}
        </Alert>
      )}

      {snapshots.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmSnapshots.loading')} />
        </>
      )}

      {snapshots.isError && (
        <EmptyState titleText={t('vmSnapshots.error.title')} status="danger">
          <EmptyStateBody>
            {snapshots.error instanceof Error ? snapshots.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void snapshots.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {snapshots.isSuccess && snapshots.data.length === 0 && (
        <EmptyState titleText={t('vmSnapshots.empty.title')}>
          <EmptyStateBody>{t('vmSnapshots.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {snapshots.isSuccess && snapshots.data.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('vmSnapshots.table.ariaLabel')}
            variant="compact"
            {...resizableTableProps(prefs)}
          >
            <Thead>
              <Tr>
                {visibleColumns.map((column) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {snapshots.data.map((snapshot) => (
                <Tr key={snapshot.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {cellOf(snapshot, column.key)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    {/* the engine's one 'active' snapshot per VM can never be
                        restored or deleted — hide the kebab, keep the cell so
                        the column keeps its shape */}
                    {snapshot.snapshot_type !== 'active' && (
                      <ActionsColumn
                        isDisabled={mutating}
                        items={[
                          {
                            title: t('vmSnapshots.action.preview'),
                            // engine: previews need a down VM and only one runs
                            // at a time — the row explains itself when blocked
                            isDisabled: !isDown || previewing !== undefined,
                            description: !isDown
                              ? t('vmSnapshots.preview.disabled.down')
                              : previewing !== undefined
                                ? t('vmSnapshots.preview.disabled.inProgress')
                                : undefined,
                            onClick: () => setConfirming({ action: 'preview', snapshot }),
                          },
                          {
                            title: t('vmSnapshots.action.restore'),
                            onClick: () => setConfirming({ action: 'restore', snapshot }),
                          },
                          {
                            title: t('vmSnapshots.clone.action'),
                            // engine: only settled regular snapshots clone — the
                            // row explains itself when blocked
                            isDisabled: cloneBlockedReason(snapshot) !== undefined,
                            description: cloneBlockedReason(snapshot),
                            onClick: () => setCloning(snapshot),
                          },
                          {
                            title: t('common.action.delete'),
                            isDanger: true,
                            onClick: () => setConfirming({ action: 'delete', snapshot }),
                          },
                        ]}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {isCreateOpen && (
        <CreateSnapshotModal
          vmId={vmId}
          onCreate={(description, persistMemory, diskIds) => {
            setIsCreateOpen(false)
            create.mutate({ description, persistMemory, diskIds })
          }}
          onClose={() => setIsCreateOpen(false)}
        />
      )}

      {confirming && (
        <ConfirmModal
          isOpen
          title={t('vmSnapshots.confirm.title', {
            action: confirmCopy[confirming.action].label,
            name: snapshotName(confirming.snapshot),
          })}
          body={confirmCopy[confirming.action].body}
          confirmLabel={confirmCopy[confirming.action].label}
          onConfirm={() => {
            setConfirming(null)
            if (confirming.action === 'commit') commit.mutate()
            else if (confirming.action === 'undo') undo.mutate()
            else if (confirming.action === 'preview') preview.mutate(confirming.snapshot)
            else (confirming.action === 'restore' ? restore : remove).mutate(confirming.snapshot)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {cloning && (
        <CloneFromSnapshotModal vmId={vmId} snapshot={cloning} onClose={() => setCloning(null)} />
      )}
    </>
  )
}

// Clone VM from snapshot dialog. The REST Add.FromSnapshot path rebuilds the
// new VM from the snapshot's stored configuration, so — unlike the whole-VM
// CloneVmModal (storage domain + collapse-snapshots knobs) — the only field is
// the new VM's name; cluster comes from the source VM (mandatory per the
// api-model). Mirrors webadmin's clone-from-snapshot dialog, which likewise
// offers only the name.
function CloneFromSnapshotModal({
  vmId,
  snapshot,
  onClose,
}: {
  vmId: string
  snapshot: Snapshot
  onClose: () => void
}) {
  const t = useT()
  const vm = useVm(vmId)
  const clone = useCloneVmFromSnapshot()
  const [name, setName] = useState('')

  const clusterId = vm.data?.cluster?.id
  const nameError = vmNameError(name)
  // cluster is a mandatory FromSnapshot field; without it (a failed/degraded VM
  // read) the clone would fault, so gate the submit until it is known
  const submitDisabled = nameError !== undefined || clusterId === undefined || clone.isPending

  const save = () => {
    if (submitDisabled || clusterId === undefined) return
    clone.mutate({ name, snapshotId: snapshot.id, clusterId }, { onSuccess: onClose })
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="clone-snapshot-title"
      aria-describedby="clone-snapshot-body"
    >
      <ModalHeader title={t('vmSnapshots.clone.title')} labelId="clone-snapshot-title" />
      <ModalBody id="clone-snapshot-body">
        <Form
          id="clone-snapshot-form"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <FormGroup fieldId="clone-snapshot-intro">
            {t('vmSnapshots.clone.body', { name: snapshotName(snapshot) })}
          </FormGroup>
          <FormGroup
            label={t('vmSnapshots.clone.nameLabel')}
            isRequired
            fieldId="clone-snapshot-name"
          >
            <TextInput
              id="clone-snapshot-name"
              isRequired
              aria-label={t('vmSnapshots.clone.nameLabel')}
              validated={name !== '' && nameError !== undefined ? 'error' : 'default'}
              value={name}
              onChange={(_event, value) => setName(value)}
            />
            {name !== '' && nameError !== undefined && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{nameError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="clone-snapshot-form"
          isLoading={clone.isPending}
          isDisabled={submitDisabled}
        >
          {t('vmSnapshots.clone.action')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={clone.isPending}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

// With ?follow=disk the embedded disk always carries its id; the attachment
// id is only a defensive fallback so a missing id can't crash the row.
function snapshotDiskId(attachment: DiskAttachment): string {
  return attachment.disk?.id ?? attachment.id
}

// Webadmin's Disk::isAllowSnapshot: direct-LUN disks and shareable disks can
// never be part of a snapshot, so they must not appear in (or be posted from)
// the "Disks to include" table — the engine faults on their ids.
function isSnapshotable(attachment: DiskAttachment): boolean {
  return attachment.disk?.storage_type !== 'lun' && attachment.disk?.shareable !== true
}

function CreateSnapshotModal({
  vmId,
  onCreate,
  onClose,
}: {
  vmId: string
  onCreate: (description: string, persistMemory: boolean, diskIds?: string[]) => void
  onClose: () => void
}) {
  const t = useT()
  const vm = useVm(vmId)
  const disks = useVmDisks(vmId)
  const [description, setDescription] = useState('')
  // null = untouched: the default follows webadmin's SnapshotModel, which
  // opens with memory checked whenever the VM is running (the checkbox is
  // only shown then) — deriving keeps the default right even if the VM read
  // resolves after mount.
  const [persistMemoryChoice, setPersistMemoryChoice] = useState<boolean | null>(null)
  // every disk starts included, so track exclusions — rows that arrive on a
  // later refetch stay checked by default
  const [excludedDiskIds, setExcludedDiskIds] = useState<ReadonlySet<string>>(new Set())

  // memory can only be captured from a running guest, so the switch is
  // offered only while the VM is up
  const isUp = vm.data?.status === 'up'
  const persistMemory = persistMemoryChoice ?? isUp

  // Shareable/direct-LUN disks are never snapshotted (Disk::isAllowSnapshot);
  // omitting them here also keeps them out of the posted subset.
  const attachments = (disks.data ?? []).filter(isSnapshotable)
  const selected = attachments.filter(
    (attachment) => !excludedDiskIds.has(snapshotDiskId(attachment)),
  )
  const allSelected = attachments.length > 0 && selected.length === attachments.length
  // a snapshot needs at least one disk — but only once the list actually
  // loaded; on error/empty the engine default (all disks) applies
  const noneSelected = disks.isSuccess && attachments.length > 0 && selected.length === 0

  const toggleDisk = (attachment: DiskAttachment, isSelecting: boolean) => {
    setExcludedDiskIds((prev) => {
      const next = new Set(prev)
      if (isSelecting) next.delete(snapshotDiskId(attachment))
      else next.add(snapshotDiskId(attachment))
      return next
    })
  }

  const submit = () => {
    if (!description.trim() || noneSelected) return
    // only a strict subset is sent — full selection (or a failed/empty disk
    // load) omits diskIds so the engine defaults to snapshotting every disk
    const diskIds =
      disks.isSuccess && selected.length > 0 && selected.length < attachments.length
        ? selected.map(snapshotDiskId)
        : undefined
    onCreate(description.trim(), isUp && persistMemory, diskIds)
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="create-snapshot-title"
      aria-describedby="create-snapshot-body"
    >
      <ModalHeader title={t('vmSnapshots.create')} labelId="create-snapshot-title" />
      <ModalBody id="create-snapshot-body">
        <Form
          id="create-snapshot-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup
            label={t('common.field.description')}
            isRequired
            fieldId="snapshot-description"
          >
            <TextInput
              id="snapshot-description"
              isRequired
              value={description}
              onChange={(_event, value) => setDescription(value)}
            />
          </FormGroup>
          {isUp && (
            <FormGroup fieldId="snapshot-save-memory">
              <Switch
                id="snapshot-save-memory"
                label={t('vmSnapshots.modal.saveMemory')}
                isChecked={persistMemory}
                onChange={(_event, checked) => setPersistMemoryChoice(checked)}
              />
            </FormGroup>
          )}
          <FormGroup label={t('vmSnapshots.modal.disks')} fieldId="snapshot-disks">
            {disks.isPending && (
              <Skeleton height="2.5rem" screenreaderText={t('vmSnapshots.modal.disks.loading')} />
            )}
            {disks.isError && (
              <HelperText>
                <HelperTextItem variant="warning">
                  {t('vmSnapshots.modal.disks.error')}
                </HelperTextItem>
              </HelperText>
            )}
            {disks.isSuccess && attachments.length === 0 && (
              <HelperText>
                <HelperTextItem>{t('vmSnapshots.modal.disks.noDisks')}</HelperTextItem>
              </HelperText>
            )}
            {disks.isSuccess && attachments.length > 0 && (
              <>
                {/* Fixed layout so the long Alias (a disk name built off the
                    VM FQDN) and Description columns truncate cleanly at their
                    share of the dialog width instead of pushing the table wider
                    than the modal and clipping mid-word at its edge. */}
                <Table
                  aria-label={t('vmSnapshots.modal.disks')}
                  variant="compact"
                  style={{ tableLayout: 'fixed', width: '100%' }}
                >
                  <Thead>
                    <Tr>
                      <Th
                        aria-label={t('vmSnapshots.modal.disks.selectAll')}
                        width={10}
                        select={{
                          isSelected: allSelected,
                          onSelect: (_event, isSelecting) =>
                            setExcludedDiskIds(
                              isSelecting ? new Set() : new Set(attachments.map(snapshotDiskId)),
                            ),
                        }}
                      />
                      <Th width={40}>{t('vmSnapshots.modal.column.alias')}</Th>
                      <Th width={15}>{t('vmSnapshots.modal.column.size')}</Th>
                      <Th width={35}>{t('common.field.description')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {attachments.map((attachment, rowIndex) => (
                      <Tr key={attachment.id}>
                        <Td
                          select={{
                            rowIndex,
                            isSelected: !excludedDiskIds.has(snapshotDiskId(attachment)),
                            onSelect: (_event, isSelecting) => toggleDisk(attachment, isSelecting),
                          }}
                        />
                        <Td
                          dataLabel={t('vmSnapshots.modal.column.alias')}
                          title={attachment.disk?.alias ?? attachment.disk?.name ?? undefined}
                        >
                          {attachment.disk?.alias ?? attachment.disk?.name ?? '—'}
                        </Td>
                        <Td dataLabel={t('vmSnapshots.modal.column.size')}>
                          {formatBytes(attachment.disk?.provisioned_size)}
                        </Td>
                        <Td
                          dataLabel={t('common.field.description')}
                          title={attachment.disk?.description || undefined}
                        >
                          {attachment.disk?.description ?? '—'}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {noneSelected && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {t('vmSnapshots.modal.disks.noneSelected')}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          type="submit"
          form="create-snapshot-form"
          isDisabled={!description.trim() || noneSelected}
        >
          {t('common.action.create')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
