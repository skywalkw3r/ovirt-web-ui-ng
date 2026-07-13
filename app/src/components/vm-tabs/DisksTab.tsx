import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Radio,
  Skeleton,
  Switch,
  TextInput,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { CheckIcon, EllipsisVIcon } from '@patternfly/react-icons'
import type { IAction } from '@patternfly/react-table'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { StatusBadge } from '../StatusBadge'
import type { NewVmDirectLunDiskSpec } from '../../api/resources/disks'
import { diskSizeBytes, type Disk, type DiskAttachment } from '../../api/schemas/disk'
import type { DiscoveredLun } from '../../api/schemas/host-storage'
import { useCapabilities } from '../../auth/capabilities'
import { useAllDisks } from '../../hooks/useCatalogPages'
import {
  useCopyDisk,
  useMoveDisk,
  useSparsifyDisk,
  useStorageDomainDiskProfiles,
} from '../../hooks/useDiskMutations'
import { useHosts } from '../../hooks/useHosts'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import {
  useAttachVmDisk,
  useCreateVmDirectLunDisk,
  useCreateVmDisk,
  useDetachVmDisk,
  useResizeVmDisk,
  useSetVmDiskActive,
  type NewVmImageDiskSpec,
} from '../../hooks/useVmDiskActions'
import { useVmDisks } from '../../hooks/useVmStorage'
import { useT } from '../../i18n/useT'
import {
  copyDisabledReasonId,
  moveDisabledReasonId,
  resizeDisabledReasonId,
  sparsifyDisabledReasonId,
} from '../../lib/diskActionGuards'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import type { MessageId } from '../../i18n/messages/en'
import { formatBytes } from '../../lib/format'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { ConfirmModal } from '../ConfirmModal'
import { DiskStatusLabel } from '../DiskStatusLabel'
import { DiskFormModal } from '../disk-form/DiskFormModal'
import { MoveCopyDiskModal, type MoveCopyMode } from '../disk-form/MoveCopyDiskModal'
import { SanStorageSection } from '../storage-domain-form/SanStorageSection'

const GiB = 1024 ** 3
const MIN_DISK_SIZE_GIB = 1
// modest thin-provisioned starting point; cow/sparse means it costs little
const DEFAULT_DISK_SIZE_GIB = 10

// Guest device models the Add-disk Interface select offers — the common
// DiskInterface values (virtio_scsi is the webadmin default, then virtio and
// ide). An existing attachment on some other model isn't edited here, so the
// list stays fixed.
const DISK_INTERFACES = ['virtio_scsi', 'virtio', 'ide']

// Allocation ⇒ format/sparse, mirroring DiskFormModal / webadmin NewDiskModel:
// Thin ⇒ cow+sparse, Preallocated ⇒ raw+!sparse.
function deriveAllocation(allocation: 'thin' | 'preallocated'): {
  format: 'cow' | 'raw'
  sparse: boolean
} {
  return allocation === 'thin' ? { format: 'cow', sparse: true } : { format: 'raw', sparse: false }
}

// Regular block domains (iscsi/fcp) default to Preallocated but stay
// changeable; managed block storage (Cinder) locks to Preallocated — same
// policy as DiskFormModal.
const BLOCK_STORAGE_TYPES = new Set(['iscsi', 'fcp'])

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (status-first per the VM glyph style, Name pinned). Labels resolve
// per-locale in the component; headers and cells both map over the same
// isVisible-filtered array so they can never desync. The actions kebab
// renders unconditionally outside the pickable set.
const COLUMNS: { key: string; labelId: MessageId; always?: boolean }[] = [
  { key: 'status', labelId: 'common.field.status' },
  { key: 'name', labelId: 'common.field.name', always: true },
  { key: 'bootable', labelId: 'vmDisks.column.bootable' },
  { key: 'interface', labelId: 'vmDisks.column.interface' },
  { key: 'format', labelId: 'vmDisks.column.format' },
  { key: 'size', labelId: 'vmDisks.column.provisionedSize' },
  { key: 'readOnly', labelId: 'vmDisks.column.readOnly' },
  { key: 'shareable', labelId: 'vmDisks.column.shareable' },
  { key: 'active', labelId: 'vmDisks.column.active' },
]

export function DisksTab({ vmId }: { vmId: string }) {
  const t = useT()
  const disks = useVmDisks(vmId)
  const create = useCreateVmDisk(vmId)
  const createLun = useCreateVmDirectLunDisk(vmId)
  const attach = useAttachVmDisk(vmId)
  const resize = useResizeVmDisk(vmId)
  const detach = useDetachVmDisk(vmId)
  const setActive = useSetVmDiskActive(vmId)
  const move = useMoveDisk()
  const copy = useCopyDisk()
  const sparsify = useSparsifyDisk()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isAttachOpen, setIsAttachOpen] = useState(false)
  // disk-type filter, mirroring the flat Disks page (image/lun/managed block)
  const [diskType, setDiskType] = useState<'all' | 'image' | 'lun' | 'managed_block_storage'>('all')
  // non-null while the edit dialog is up; carries the underlying disk to edit
  const [editing, setEditing] = useState<Disk | null>(null)
  const [resizing, setResizing] = useState<DiskAttachment | null>(null)
  const [detaching, setDetaching] = useState<DiskAttachment | null>(null)
  // non-null while the sparsify confirm dialog is up; carries the disk to reclaim
  const [sparsifying, setSparsifying] = useState<Disk | null>(null)
  // non-null while a move/copy dialog is up; carries the disk + which flow
  const [relocating, setRelocating] = useState<{ mode: MoveCopyMode; disk: Disk } | null>(null)

  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('vm-disks', columns)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  const mutating =
    create.isPending ||
    createLun.isPending ||
    attach.isPending ||
    resize.isPending ||
    detach.isPending ||
    setActive.isPending ||
    move.isPending ||
    copy.isPending ||
    sparsify.isPending

  // Disk-type filter over the attachments — a disk without storage_type is an
  // image (the engine default), same convention as the flat Disks page.
  const visibleDisks = (disks.data ?? []).filter(
    (attachment) => diskType === 'all' || (attachment.disk?.storage_type ?? 'image') === diskType,
  )

  // ids already attached here — the Attach picker excludes them
  const attachedDiskIds = new Set(
    (disks.data ?? [])
      .map((attachment) => attachment.disk?.id)
      .filter((id): id is string => id !== undefined),
  )

  // Build the per-row action menu. Move/Copy target the underlying disk (not
  // the attachment). Resize/Move/Copy stay VISIBLE but disabled with the
  // reason as the item description (tooltip) for direct-LUN and locked disks —
  // the shared lib/diskActionGuards rules, same gating as the Disks page kebab.
  const rowActions = (attachment: DiskAttachment): IAction[] => {
    const disk = attachment.disk
    const diskId = disk?.id
    const isActive = attachment.active === true
    const resizeReasonId = disk ? resizeDisabledReasonId(disk) : undefined
    const moveReasonId = disk ? moveDisabledReasonId(disk) : undefined
    const copyReasonId = disk ? copyDisabledReasonId(disk) : undefined
    const sparsifyReasonId = disk ? sparsifyDisabledReasonId(disk) : undefined

    const actions: IAction[] = []
    if (diskId !== undefined && disk) {
      const asDisk: Disk = { ...disk, id: diskId }
      actions.push({
        title: t('common.action.edit'),
        onClick: () => setEditing(asDisk),
      })
    }
    actions.push({
      title: t('vmDisks.action.resize'),
      isDisabled: resizeReasonId !== undefined,
      description: resizeReasonId !== undefined ? t(resizeReasonId) : undefined,
      onClick: () => setResizing(attachment),
    })
    actions.push({
      title: isActive ? t('vmDisks.action.deactivate') : t('vmDisks.action.activate'),
      onClick: () => setActive.mutate({ attachment, active: !isActive }),
    })
    if (diskId !== undefined && disk) {
      const asDisk: Disk = { ...disk, id: diskId }
      actions.push({
        title: t('common.action.move'),
        isDisabled: moveReasonId !== undefined,
        description: moveReasonId !== undefined ? t(moveReasonId) : undefined,
        onClick: () => setRelocating({ mode: 'move', disk: asDisk }),
      })
      actions.push({
        title: t('vmDisks.action.copy'),
        isDisabled: copyReasonId !== undefined,
        description: copyReasonId !== undefined ? t(copyReasonId) : undefined,
        onClick: () => setRelocating({ mode: 'copy', disk: asDisk }),
      })
      // Sparsify targets the underlying image disk (reclaims unused space).
      // Same gating as the Disks page kebab (OK + image + thin/sparse), stays
      // visible-but-disabled with the reason as tooltip otherwise.
      actions.push({
        title: t('disks.action.sparsify'),
        isDanger: true,
        isDisabled: sparsifyReasonId !== undefined,
        description: sparsifyReasonId !== undefined ? t(sparsifyReasonId) : undefined,
        onClick: () => setSparsifying(asDisk),
      })
    }
    actions.push({ isSeparator: true })
    actions.push({
      title: t('common.action.detach'),
      isDanger: true,
      onClick: () => setDetaching(attachment),
    })
    return actions
  }

  const cellOf = (attachment: DiskAttachment, key: string): ReactNode => {
    switch (key) {
      case 'status':
        return <DiskStatusLabel status={attachment.disk?.status} />
      case 'name':
        return (
          <>
            {attachment.disk?.name ?? '—'}
            {attachment.disk?.storage_type === 'lun' && (
              <Label isCompact color="purple" style={{ marginInlineStart: '0.5rem' }}>
                {t('disk.lun.badge')}
              </Label>
            )}
          </>
        )
      case 'bootable':
        return attachment.bootable ? (
          <Label isCompact color="blue">
            {t('vmDisks.bootable')}
          </Label>
        ) : (
          '—'
        )
      case 'interface':
        return attachment.interface ?? '—'
      case 'format':
        return attachment.disk?.format ?? '—'
      case 'size':
        // a direct-LUN disk reports its size from the bound LUN
        return formatBytes(diskSizeBytes(attachment.disk))
      case 'readOnly':
        // read_only rides on the attachment, not the disk
        return attachment.read_only === true ? <CheckIcon aria-label={t('common.yes')} /> : '—'
      case 'shareable':
        return attachment.disk?.shareable === true ? (
          <CheckIcon aria-label={t('common.yes')} />
        ) : (
          '—'
        )
      case 'active':
        return attachment.active === true ? (
          <StatusBadge color="green">{t('vmDisks.active')}</StatusBadge>
        ) : attachment.active === false ? (
          <StatusBadge color="grey">{t('vmDisks.inactive')}</StatusBadge>
        ) : (
          '—'
        )
      default:
        return '—'
    }
  }

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button variant="primary" onClick={() => setIsAddOpen(true)} isDisabled={mutating}>
              {t('vmDisks.add')}
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="secondary" onClick={() => setIsAttachOpen(true)} isDisabled={mutating}>
              {t('vmDisks.attach')}
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <ToggleGroup aria-label={t('disks.filter.diskType')}>
              <ToggleGroupItem
                text={t('common.filter.all')}
                isSelected={diskType === 'all'}
                onChange={() => setDiskType('all')}
              />
              <ToggleGroupItem
                text={t('disks.filter.images')}
                isSelected={diskType === 'image'}
                onChange={() => setDiskType('image')}
              />
              <ToggleGroupItem
                text={t('disks.filter.directLun')}
                isSelected={diskType === 'lun'}
                onChange={() => setDiskType('lun')}
              />
              <ToggleGroupItem
                text={t('disks.filter.managedBlock')}
                isSelected={diskType === 'managed_block_storage'}
                onChange={() => setDiskType('managed_block_storage')}
              />
            </ToggleGroup>
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

      {disks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmDisks.loading')} />
        </>
      )}

      {disks.isError && (
        <EmptyState titleText={t('vmDisks.error.title')} status="danger">
          <EmptyStateBody>
            {disks.error instanceof Error ? disks.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void disks.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length === 0 && (
        <EmptyState titleText={t('vmDisks.empty.title')}>
          <EmptyStateBody>{t('vmDisks.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('vmDisks.table.ariaLabel')}
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
              {visibleDisks.map((attachment) => (
                <Tr key={attachment.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {cellOf(attachment, column.key)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={mutating}
                      actionsToggle={({ onToggle, isOpen, isDisabled, toggleRef }) => (
                        <MenuToggle
                          ref={toggleRef}
                          aria-label={t('vmDisks.actionsFor', {
                            name: attachment.disk?.name ?? attachment.id,
                          })}
                          variant="plain"
                          icon={<EllipsisVIcon />}
                          onClick={onToggle}
                          isExpanded={isOpen}
                          isDisabled={isDisabled}
                        />
                      )}
                      items={rowActions(attachment)}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {editing && <DiskFormModal disk={editing} onClose={() => setEditing(null)} />}

      {isAddOpen && (
        <AddDiskModal
          onAdd={(spec) => {
            setIsAddOpen(false)
            create.mutate(spec)
          }}
          onAddLun={(spec) => {
            setIsAddOpen(false)
            createLun.mutate(spec)
          }}
          onClose={() => setIsAddOpen(false)}
        />
      )}

      {isAttachOpen && (
        <AttachDiskModal
          attachedDiskIds={attachedDiskIds}
          onAttach={(disk, bootable) => {
            setIsAttachOpen(false)
            attach.mutate({
              diskId: disk.id,
              bootable,
              diskName: disk.alias ?? disk.name ?? disk.id,
            })
          }}
          onClose={() => setIsAttachOpen(false)}
        />
      )}

      {relocating && (
        <MoveCopyDiskModal
          mode={relocating.mode}
          disk={relocating.disk}
          onSubmit={({ storageDomainId, name }) => {
            const disk = relocating.disk
            setRelocating(null)
            if (relocating.mode === 'move') {
              move.mutate({ id: disk.id, storageDomainId })
            } else {
              copy.mutate({ id: disk.id, storageDomainId, name })
            }
          }}
          onClose={() => setRelocating(null)}
        />
      )}

      {resizing && (
        <ResizeDiskModal
          attachment={resizing}
          onResize={(newSizeBytes) => {
            setResizing(null)
            resize.mutate({ attachment: resizing, newSizeBytes })
          }}
          onClose={() => setResizing(null)}
        />
      )}

      {detaching && (
        <ConfirmModal
          isOpen
          title={t('vmDisks.detach.confirm.title', {
            name: detaching.disk?.name ?? detaching.id,
          })}
          body={t('vmDisks.detach.confirm.body')}
          confirmLabel={t('common.action.detach')}
          onConfirm={() => {
            setDetaching(null)
            detach.mutate(detaching)
          }}
          onCancel={() => setDetaching(null)}
        />
      )}

      {sparsifying && (
        <ConfirmModal
          isOpen
          title={t('disks.sparsify.confirm.title', {
            name: sparsifying.alias ?? sparsifying.name ?? sparsifying.id,
          })}
          body={t('disks.sparsify.confirm.body')}
          confirmLabel={t('disks.action.sparsify')}
          onConfirm={() => {
            const disk = sparsifying
            setSparsifying(null)
            sparsify.mutate(disk.id)
          }}
          onCancel={() => setSparsifying(null)}
        />
      )}
    </>
  )
}

// Storage-domain-scoped disk-profile picker for the Add-Disk (image) dialog —
// a local mirror of DiskFormModal's DiskProfileField (private there, not
// exported). Options load
// off the picked SD through the same useStorageDomainDiskProfiles query; a
// domain with no profiles (or a mock without the /diskprofiles route) yields []
// and the select degrades to a single "Default profile" entry, which threads
// through as an omitted disk_profile so the engine assigns the SD default.
function DiskProfileSelect({
  storageDomainId,
  value,
  onChange,
}: {
  storageDomainId: string | undefined
  value: string
  onChange: (profileId: string) => void
}) {
  const profiles = useStorageDomainDiskProfiles(storageDomainId)
  const options = profiles.data ?? []

  return (
    <FormGroup label="Disk profile" fieldId="add-disk-profile">
      {profiles.isPending && storageDomainId ? (
        <Skeleton height="2.25rem" screenreaderText="Loading disk profiles" />
      ) : (
        <FormSelect
          id="add-disk-profile"
          aria-label="Disk profile"
          value={value}
          isDisabled={!storageDomainId}
          onChange={(_event, next) => onChange(next)}
        >
          <FormSelectOption value="" label="Default profile" />
          {options.map((profile) => (
            <FormSelectOption
              key={profile.id}
              value={profile.id}
              label={profile.name ?? profile.id}
            />
          ))}
        </FormSelect>
      )}
      <FormHelperText>
        <HelperText>
          <HelperTextItem>
            {storageDomainId
              ? 'Leave on Default profile to use the storage domain default.'
              : 'Select a storage domain to choose a profile.'}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>
  )
}

function AddDiskModal({
  onAdd,
  onAddLun,
  onClose,
}: {
  onAdd: (spec: NewVmImageDiskSpec) => void
  onAddLun: (spec: NewVmDirectLunDiskSpec) => void
  onClose: () => void
}) {
  const t = useT()
  const storageDomains = useStorageDomains()
  // Direct LUN needs host-scoped SAN discovery (GET /hosts + the discover
  // round-trips are admin-only on the engine) — the branch is admin-gated and
  // user tier keeps the image-only dialog.
  const { isAdmin } = useCapabilities()
  const hosts = useHosts()
  const [diskType, setDiskType] = useState<'image' | 'lun'>('image')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  // '' while the input is cleared mid-edit; blur snaps it back to a number
  const [sizeGib, setSizeGib] = useState<number | ''>(DEFAULT_DISK_SIZE_GIB)
  const [storageDomainId, setStorageDomainId] = useState('')
  const [bootable, setBootable] = useState(false)
  // guest device model on the attachment (webadmin default virtio_scsi)
  const [diskInterface, setDiskInterface] = useState('virtio_scsi')
  // allocation radio → format/sparse; touched flag mirrors webadmin's
  // isUserSelectedVolumeType so a block-SD default doesn't override a manual pick
  const [allocation, setAllocation] = useState<'thin' | 'preallocated'>('thin')
  const [allocationTouched, setAllocationTouched] = useState(false)
  const [shareable, setShareable] = useState(false)
  // read_only rides on the attachment (api-model DiskAttachment.readOnly)
  const [readOnly, setReadOnly] = useState(false)
  // '' ⇒ let the engine assign the storage domain's default disk profile
  const [diskProfileId, setDiskProfileId] = useState('')

  // Direct LUN branch: discovery host, fabric kind, the single picked LUN
  // (full object — the create body needs the iSCSI coordinates + size).
  const [lunHostId, setLunHostId] = useState('')
  const [lunStorageType, setLunStorageType] = useState<'iscsi' | 'fcp'>('iscsi')
  const [selectedLunIds, setSelectedLunIds] = useState<string[]>([])
  const [selectedLuns, setSelectedLuns] = useState<DiscoveredLun[]>([])
  const upHosts = (hosts.data ?? []).filter((host) => host.status === 'up')

  // image disks can only live on data domains — iso/export domains hold
  // other content types
  const dataDomains = (storageDomains.data ?? []).filter((domain) => domain.type === 'data')

  // Allocation default follows the picked SD's backing (block ⇒ Preallocated)
  // until the user touches the radio — same policy as DiskFormModal.
  const selectedDomain = dataDomains.find((domain) => domain.id === storageDomainId)
  const selectedStorageType = selectedDomain?.storage?.type ?? ''
  const managedBlockDomain = selectedStorageType === 'managed_block_storage'
  const blockDefaultPreallocated =
    BLOCK_STORAGE_TYPES.has(selectedStorageType) || managedBlockDomain
  const effectiveAllocation: 'thin' | 'preallocated' = managedBlockDomain
    ? 'preallocated'
    : allocationTouched
      ? allocation
      : blockDefaultPreallocated
        ? 'preallocated'
        : 'thin'
  const derived = deriveAllocation(effectiveAllocation)

  const nameValid = name.trim() !== ''
  const sizeValid = typeof sizeGib === 'number' && sizeGib >= MIN_DISK_SIZE_GIB
  const nameError = nameTouched && !nameValid
  const lunSelected = selectedLuns.length === 1
  const canSubmit =
    diskType === 'image'
      ? nameValid && sizeValid && storageDomainId !== ''
      : nameValid && lunSelected

  const stepSize = (delta: number) => {
    const current = typeof sizeGib === 'number' && !Number.isNaN(sizeGib) ? sizeGib : 0
    setSizeGib(Math.max(MIN_DISK_SIZE_GIB, current + delta))
  }

  const onSizeChange = (event: FormEvent<HTMLInputElement>) => {
    const raw = (event.target as HTMLInputElement).value
    setSizeGib(raw === '' ? '' : Number(raw))
  }

  const onSizeBlur = () => {
    if (typeof sizeGib !== 'number' || Number.isNaN(sizeGib)) {
      setSizeGib(DEFAULT_DISK_SIZE_GIB)
    } else if (sizeGib < MIN_DISK_SIZE_GIB) {
      setSizeGib(MIN_DISK_SIZE_GIB)
    }
  }

  const submit = () => {
    if (diskType === 'lun') {
      const lun = selectedLuns[0]
      if (!nameValid || lun === undefined) return
      onAddLun({
        alias: name.trim(),
        bootable,
        lun: {
          type: lunStorageType,
          id: lun.id,
          // iSCSI LUNs carry their connection coordinates; FC only the id
          ...(lunStorageType === 'iscsi'
            ? { address: lun.address, port: lun.port, target: lun.target }
            : {}),
        },
      })
      return
    }
    if (!nameValid || typeof sizeGib !== 'number' || !sizeValid || storageDomainId === '') return
    onAdd({
      name: name.trim(),
      sizeBytes: sizeGib * GiB,
      storageDomainId,
      bootable,
      interface: diskInterface,
      // allocation derives the wire format/sparse
      format: derived.format,
      sparse: derived.sparse,
      shareable,
      readOnly,
      // omit when Default profile is selected — the engine assigns the SD default
      diskProfileId: diskProfileId === '' ? undefined : diskProfileId,
    })
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="add-disk-title"
      aria-describedby="add-disk-body"
    >
      <ModalHeader title={t('vmDisks.addModal.title')} labelId="add-disk-title" />
      <ModalBody id="add-disk-body">
        <Form
          id="add-disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {/* Image | Direct LUN (admin-only: LUN discovery is host-scoped and
              needs the admin tier — user tier keeps the image dialog). */}
          {isAdmin && (
            <FormGroup
              label={t('disk.lun.diskType.label')}
              role="radiogroup"
              isInline
              fieldId="add-disk-type"
            >
              <Radio
                id="add-disk-type-image"
                name="add-disk-type"
                label={t('disk.lun.diskType.image')}
                aria-label={t('disk.lun.diskType.image')}
                isChecked={diskType === 'image'}
                onChange={() => setDiskType('image')}
              />
              <Radio
                id="add-disk-type-lun"
                name="add-disk-type"
                label={t('disk.lun.diskType.directLun')}
                aria-label={t('disk.lun.diskType.directLun')}
                isChecked={diskType === 'lun'}
                onChange={() => setDiskType('lun')}
              />
            </FormGroup>
          )}

          <FormGroup label={t('common.field.name')} isRequired fieldId="add-disk-name">
            <TextInput
              id="add-disk-name"
              isRequired
              value={name}
              validated={nameError ? 'error' : 'default'}
              onChange={(_event, value) => setName(value)}
              onBlur={() => setNameTouched(true)}
            />
            {nameError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vmDisks.addModal.nameRequired')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
          {diskType === 'image' && (
            <FormGroup label={t('vmDisks.addModal.size')} isRequired fieldId="add-disk-size">
              <NumberInput
                value={sizeGib}
                min={MIN_DISK_SIZE_GIB}
                onMinus={() => stepSize(-1)}
                onPlus={() => stepSize(1)}
                onChange={onSizeChange}
                onBlur={onSizeBlur}
                inputName="add-disk-size"
                inputAriaLabel={t('vmDisks.addModal.sizeAria')}
                minusBtnAriaLabel={t('vmDisks.addModal.decrease')}
                plusBtnAriaLabel={t('vmDisks.addModal.increase')}
                unit="GiB"
                widthChars={6}
                validated={sizeValid ? 'default' : 'error'}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={sizeValid ? 'default' : 'error'}>
                    {t('vmDisks.addModal.atLeast', { min: MIN_DISK_SIZE_GIB })}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}
          {diskType === 'image' && (
            <FormGroup
              label={t('vmDisks.addModal.storageDomain')}
              isRequired
              fieldId="add-disk-storage-domain"
            >
              {storageDomains.isPending && (
                <Skeleton
                  height="2.25rem"
                  screenreaderText={t('vmDisks.addModal.storageDomain.loading')}
                />
              )}
              {storageDomains.isError && (
                <>
                  <HelperText>
                    <HelperTextItem variant="error">
                      {t('vmDisks.addModal.storageDomain.error', {
                        message:
                          storageDomains.error instanceof Error
                            ? storageDomains.error.message
                            : t('common.error.unknown'),
                      })}
                    </HelperTextItem>
                  </HelperText>
                  <Button variant="link" isInline onClick={() => void storageDomains.refetch()}>
                    {t('common.action.retry')}
                  </Button>
                </>
              )}
              {storageDomains.isSuccess && (
                <FormSelect
                  id="add-disk-storage-domain"
                  aria-label={t('vmDisks.addModal.storageDomain')}
                  value={storageDomainId}
                  onChange={(_event, value) => setStorageDomainId(value)}
                >
                  <FormSelectOption
                    value=""
                    label={
                      dataDomains.length === 0
                        ? t('vmDisks.addModal.storageDomain.none')
                        : t('vmDisks.addModal.storageDomain.select')
                    }
                    isPlaceholder
                    isDisabled
                  />
                  {dataDomains.map((domain) => (
                    <FormSelectOption key={domain.id} value={domain.id} label={domain.name} />
                  ))}
                </FormSelect>
              )}
            </FormGroup>
          )}
          {diskType === 'image' && (
            <DiskProfileSelect
              storageDomainId={storageDomainId || undefined}
              value={diskProfileId}
              onChange={setDiskProfileId}
            />
          )}
          {diskType === 'image' && (
            <FormGroup label="Interface" fieldId="add-disk-interface">
              <FormSelect
                id="add-disk-interface"
                aria-label="Interface"
                value={diskInterface}
                onChange={(_event, value) => setDiskInterface(value)}
              >
                {DISK_INTERFACES.map((model) => (
                  <FormSelectOption key={model} value={model} label={model} />
                ))}
              </FormSelect>
            </FormGroup>
          )}
          {diskType === 'image' && (
            <FormGroup
              label="Allocation policy"
              role="radiogroup"
              isStack
              fieldId="add-disk-allocation"
            >
              <Radio
                id="add-disk-allocation-thin"
                name="add-disk-allocation"
                label="Thin provision"
                aria-label="Thin provision"
                isChecked={effectiveAllocation === 'thin'}
                isDisabled={managedBlockDomain}
                onChange={() => {
                  setAllocationTouched(true)
                  setAllocation('thin')
                }}
              />
              <Radio
                id="add-disk-allocation-preallocated"
                name="add-disk-allocation"
                label="Preallocated"
                aria-label="Preallocated"
                isChecked={effectiveAllocation === 'preallocated'}
                isDisabled={managedBlockDomain}
                onChange={() => {
                  setAllocationTouched(true)
                  setAllocation('preallocated')
                }}
              />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {managedBlockDomain
                      ? 'Managed block storage domains require preallocated disks.'
                      : blockDefaultPreallocated && !allocationTouched
                        ? 'Block storage domains default to preallocated — switch to thin if you prefer.'
                        : `Format: ${derived.format === 'cow' ? 'QCOW2 (thin)' : 'Raw (preallocated)'}`}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          )}

          {/* Direct LUN branch: host picker + fabric kind + the reused
              discover/login/LUN-pick flow, single-select (one LUN per disk). */}
          {diskType === 'lun' && (
            <>
              <FormGroup label={t('disk.lun.host.label')} isRequired fieldId="add-disk-lun-host">
                {hosts.isPending && (
                  <Skeleton height="2.25rem" screenreaderText={t('disk.lun.host.loading')} />
                )}
                {hosts.isError && (
                  <>
                    <HelperText>
                      <HelperTextItem variant="error">
                        {t('disk.lun.host.error', {
                          message:
                            hosts.error instanceof Error
                              ? hosts.error.message
                              : t('common.error.unknown'),
                        })}
                      </HelperTextItem>
                    </HelperText>
                    <Button variant="link" isInline onClick={() => void hosts.refetch()}>
                      {t('common.action.retry')}
                    </Button>
                  </>
                )}
                {hosts.isSuccess && (
                  <FormSelect
                    id="add-disk-lun-host"
                    aria-label={t('disk.lun.host.label')}
                    value={lunHostId}
                    onChange={(_event, value) => setLunHostId(value)}
                  >
                    <FormSelectOption
                      value=""
                      label={
                        upHosts.length === 0 ? t('disk.lun.host.none') : t('disk.lun.host.select')
                      }
                      isPlaceholder
                      isDisabled
                    />
                    {upHosts.map((host) => (
                      <FormSelectOption
                        key={host.id}
                        value={host.id}
                        label={host.name ?? host.id}
                      />
                    ))}
                  </FormSelect>
                )}
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{t('disk.lun.host.help')}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>

              <FormGroup
                label={t('disk.lun.storageType.label')}
                role="radiogroup"
                isInline
                fieldId="add-disk-lun-storage-type"
              >
                <Radio
                  id="add-disk-lun-type-iscsi"
                  name="add-disk-lun-storage-type"
                  label={t('disk.lun.storageType.iscsi')}
                  aria-label={t('disk.lun.storageType.iscsi')}
                  isChecked={lunStorageType === 'iscsi'}
                  onChange={() => setLunStorageType('iscsi')}
                />
                <Radio
                  id="add-disk-lun-type-fcp"
                  name="add-disk-lun-storage-type"
                  label={t('disk.lun.storageType.fcp')}
                  aria-label={t('disk.lun.storageType.fcp')}
                  isChecked={lunStorageType === 'fcp'}
                  onChange={() => setLunStorageType('fcp')}
                />
              </FormGroup>

              <FormGroup
                label={
                  lunStorageType === 'iscsi'
                    ? t('disk.lun.section.iscsi')
                    : t('disk.lun.section.fcp')
                }
                isRequired
                fieldId="add-disk-lun-san"
              >
                <SanStorageSection
                  storageType={lunStorageType}
                  hostId={lunHostId}
                  selectedLunIds={selectedLunIds}
                  onSelectedLunIdsChange={setSelectedLunIds}
                  onSelectedLunsChange={setSelectedLuns}
                  selectionVariant="radio"
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      {lunSelected
                        ? t('disk.lun.selected', {
                            id: selectedLuns[0].id,
                            size: formatBytes(selectedLuns[0].size),
                          })
                        : t('disk.lun.selectOne')}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </>
          )}
          <FormGroup fieldId="add-disk-bootable">
            <Switch
              id="add-disk-bootable"
              label={t('vmDisks.addModal.bootable')}
              isChecked={bootable}
              onChange={(_event, checked) => setBootable(checked)}
            />
          </FormGroup>
          {diskType === 'image' && (
            <FormGroup fieldId="add-disk-shareable">
              <Switch
                id="add-disk-shareable"
                label="Shareable"
                isChecked={shareable}
                onChange={(_event, checked) => setShareable(checked)}
              />
            </FormGroup>
          )}
          {diskType === 'image' && (
            <FormGroup fieldId="add-disk-read-only">
              <Switch
                id="add-disk-read-only"
                label="Read-only"
                isChecked={readOnly}
                onChange={(_event, checked) => setReadOnly(checked)}
              />
            </FormGroup>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="add-disk-form" isDisabled={!canSubmit}>
          {t('common.action.add')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function ResizeDiskModal({
  attachment,
  onResize,
  onClose,
}: {
  attachment: DiskAttachment
  onResize: (newSizeBytes: number) => void
  onClose: () => void
}) {
  const t = useT()
  const currentBytes = attachment.disk?.provisioned_size ?? 0
  // smallest whole GiB strictly above the current size — both the starting
  // value and the floor the stepper/blur snap back to
  const minGib = Math.floor(currentBytes / GiB) + 1
  // '' while the input is cleared mid-edit; blur snaps it back to a number
  const [sizeGib, setSizeGib] = useState<number | ''>(minGib)

  // the engine only grows image disks — shrinking is rejected with a fault
  const sizeValid = typeof sizeGib === 'number' && sizeGib * GiB > currentBytes

  const stepSize = (delta: number) => {
    const current = typeof sizeGib === 'number' && !Number.isNaN(sizeGib) ? sizeGib : 0
    setSizeGib(Math.max(minGib, current + delta))
  }

  const onSizeChange = (event: FormEvent<HTMLInputElement>) => {
    const raw = (event.target as HTMLInputElement).value
    setSizeGib(raw === '' ? '' : Number(raw))
  }

  const onSizeBlur = () => {
    if (typeof sizeGib !== 'number' || Number.isNaN(sizeGib) || sizeGib < minGib) {
      setSizeGib(minGib)
    }
  }

  const submit = () => {
    if (typeof sizeGib !== 'number' || !sizeValid) return
    onResize(sizeGib * GiB)
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="resize-disk-title"
      aria-describedby="resize-disk-body"
    >
      <ModalHeader
        title={t('vmDisks.resizeModal.title', { name: attachment.disk?.name ?? attachment.id })}
        labelId="resize-disk-title"
      />
      <ModalBody id="resize-disk-body">
        <Form
          id="resize-disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('vmDisks.resizeModal.newSize')} isRequired fieldId="resize-disk-size">
            <NumberInput
              value={sizeGib}
              min={minGib}
              onMinus={() => stepSize(-1)}
              onPlus={() => stepSize(1)}
              onChange={onSizeChange}
              onBlur={onSizeBlur}
              inputName="resize-disk-size"
              inputAriaLabel={t('vmDisks.resizeModal.newSizeAria')}
              minusBtnAriaLabel={t('vmDisks.addModal.decrease')}
              plusBtnAriaLabel={t('vmDisks.addModal.increase')}
              unit="GiB"
              widthChars={6}
              validated={sizeValid ? 'default' : 'error'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={sizeValid ? 'default' : 'error'}>
                  {t('vmDisks.resizeModal.grow', { size: formatBytes(currentBytes) })}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="resize-disk-form" isDisabled={!sizeValid}>
          {t('vmDisks.action.resizeConfirm')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function diskOptionLabel(disk: Disk): string {
  const name = disk.alias ?? disk.name ?? disk.id
  const size = disk.provisioned_size ? ` (${formatBytes(disk.provisioned_size)})` : ''
  return `${name}${size}`
}

// Attach an existing floating disk. The flat /disks collection can't tell us
// which disks are truly unattached without a per-disk follow, so we exclude the
// ISO images and the disks already attached to THIS VM and let the engine be
// the backstop (it faults when a disk is already bound to another VM and the
// message surfaces verbatim) — webadmin relies on the same server-side check.
function AttachDiskModal({
  attachedDiskIds,
  onAttach,
  onClose,
}: {
  attachedDiskIds: Set<string>
  onAttach: (disk: Disk, bootable: boolean) => void
  onClose: () => void
}) {
  const t = useT()
  const allDisks = useAllDisks()
  const [diskId, setDiskId] = useState('')
  const [bootable, setBootable] = useState(false)

  const candidates = (allDisks.data ?? []).filter(
    (disk) => disk.content_type !== 'iso' && !attachedDiskIds.has(disk.id),
  )
  const selected = candidates.find((disk) => disk.id === diskId)

  const submit = () => {
    if (!selected) return
    onAttach(selected, bootable)
  }

  return (
    <Modal
      variant="small"
      isOpen
      onClose={onClose}
      aria-labelledby="attach-disk-title"
      aria-describedby="attach-disk-body"
    >
      <ModalHeader title={t('vmDisks.attachModal.title')} labelId="attach-disk-title" />
      <ModalBody id="attach-disk-body">
        <Form
          id="attach-disk-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <FormGroup label={t('vmDisks.attachModal.disk')} isRequired fieldId="attach-disk-select">
            {allDisks.isPending && (
              <Skeleton height="2.25rem" screenreaderText={t('vmDisks.attachModal.disk.loading')} />
            )}
            {allDisks.isError && (
              <>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t('vmDisks.attachModal.disk.error', {
                      message:
                        allDisks.error instanceof Error
                          ? allDisks.error.message
                          : t('common.error.unknown'),
                    })}
                  </HelperTextItem>
                </HelperText>
                <Button variant="link" isInline onClick={() => void allDisks.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </>
            )}
            {allDisks.isSuccess && (
              <FormSelect
                id="attach-disk-select"
                aria-label={t('vmDisks.attachModal.disk.aria')}
                value={diskId}
                onChange={(_event, value) => setDiskId(value)}
              >
                <FormSelectOption
                  value=""
                  label={
                    candidates.length === 0
                      ? t('vmDisks.attachModal.disk.none')
                      : t('vmDisks.attachModal.disk.select')
                  }
                  isPlaceholder
                  isDisabled
                />
                {candidates.map((disk) => (
                  <FormSelectOption key={disk.id} value={disk.id} label={diskOptionLabel(disk)} />
                ))}
              </FormSelect>
            )}
          </FormGroup>
          <FormGroup fieldId="attach-disk-bootable">
            <Switch
              id="attach-disk-bootable"
              label={t('vmDisks.addModal.bootable')}
              isChecked={bootable}
              onChange={(_event, checked) => setBootable(checked)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" type="submit" form="attach-disk-form" isDisabled={!selected}>
          {t('common.action.attach')}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t('common.action.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
