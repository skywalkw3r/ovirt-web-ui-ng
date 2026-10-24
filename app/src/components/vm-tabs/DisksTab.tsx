import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  MenuToggle,
  Skeleton,
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
import { Link } from '@tanstack/react-router'
import { StatusBadge } from '../StatusBadge'
import { diskSizeBytes, type Disk, type DiskAttachment } from '../../api/schemas/disk'
import { useCopyDisk, useMoveDisk, useSparsifyDisk } from '../../hooks/useDiskMutations'
import { useStorageDomainLookup } from '../../hooks/useStorageDomainLookup'
import {
  useAttachVmDisk,
  useCreateVmDirectLunDisk,
  useCreateVmDisk,
  useDetachVmDisk,
  useResizeVmDisk,
  useSetVmDiskActive,
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
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import type { MessageId } from '../../i18n/messages/en'
import { diskFormatText, diskInterfaceText, formatBytes } from '../../lib/format'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { ConfirmModal } from '../ConfirmModal'
import { DiskStatusLabel } from '../DiskStatusLabel'
import { AddDiskModal } from '../disk-form/AddDiskModal'
import { AttachDiskModal } from '../disk-form/AttachDiskModal'
import { DiskFormModal } from '../disk-form/DiskFormModal'
import { MoveCopyDiskModal, type MoveCopyMode } from '../disk-form/MoveCopyDiskModal'
import { ResizeDiskModal } from '../disk-form/ResizeDiskModal'

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (status-first per the VM glyph style, Name pinned). Labels resolve
// per-locale in the component; headers and cells both map over the same
// isVisible-filtered array so they can never desync. The actions kebab
// renders unconditionally outside the pickable set.
const COLUMNS: {
  key: string
  labelId: MessageId
  always?: boolean
  // opt-in header sort (see hooks/useColumnSort). Status and Active stay
  // unsortable — they are state glyphs, not scannable values (same rule as the
  // list pages).
  sortValue?: (attachment: DiskAttachment) => string | number | undefined
}[] = [
  { key: 'status', labelId: 'common.field.status' },
  {
    key: 'name',
    labelId: 'common.field.name',
    always: true,
    sortValue: (attachment) => attachment.disk?.name,
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (attachment) => attachment.disk?.description || undefined,
  },
  {
    key: 'bootable',
    labelId: 'vmDisks.column.bootable',
    sortValue: (attachment) =>
      attachment.bootable === undefined ? undefined : attachment.bootable ? 1 : 0,
  },
  {
    key: 'interface',
    labelId: 'vmDisks.column.interface',
    sortValue: (attachment) => attachment.interface,
  },
  {
    key: 'format',
    labelId: 'vmDisks.column.format',
    sortValue: (attachment) => attachment.disk?.format,
  },
  {
    key: 'size',
    labelId: 'vmDisks.column.provisionedSize',
    // the byte value the cell formats (LUN fallback and all), so the sort is
    // numeric rather than lexical on "10 GiB"
    sortValue: (attachment) => diskSizeBytes(attachment.disk),
  },
  // No sortValue: the cell resolves names through the component-scoped
  // storage-domain lookup, which these module-level sorters can't reach —
  // unsortable like the other non-scannable columns.
  { key: 'storageDomain', labelId: 'vmDisks.column.storageDomain' },
  {
    key: 'readOnly',
    labelId: 'vmDisks.column.readOnly',
    sortValue: (attachment) =>
      attachment.read_only === undefined ? undefined : attachment.read_only ? 1 : 0,
  },
  {
    key: 'shareable',
    labelId: 'vmDisks.column.shareable',
    sortValue: (attachment) =>
      attachment.disk?.shareable === undefined ? undefined : attachment.disk?.shareable ? 1 : 0,
  },
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

  // id → cached storage-domain join for the Storage domain column (the
  // attachment's inline refs are id-only stubs)
  const storageDomainOf = useStorageDomainLookup()

  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('vm-disks', columns)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
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
  const sortedDisks = sortRows(visibleDisks, sort, (attachment, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(attachment),
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
            {/* Cross-link to the disk's own detail page; a stub row without an
                id keeps plain text. The LUN badge stays outside the link. */}
            {attachment.disk?.id !== undefined ? (
              <Link to="/disks/$diskId" params={{ diskId: attachment.disk.id }}>
                {attachment.disk.name ?? attachment.disk.id}
              </Link>
            ) : (
              (attachment.disk?.name ?? '—')
            )}
            {attachment.disk?.storage_type === 'lun' && (
              <Label isCompact color="purple" style={{ marginInlineStart: '0.5rem' }}>
                {t('disk.lun.badge')}
              </Label>
            )}
          </>
        )
      case 'description':
        return attachment.disk?.description || '—'
      case 'bootable':
        return attachment.bootable ? (
          <Label isCompact color="blue">
            {t('vmDisks.bootable')}
          </Label>
        ) : (
          '—'
        )
      case 'interface':
        return diskInterfaceText(attachment.interface)
      case 'format':
        return diskFormatText(attachment.disk?.format)
      case 'size':
        // a direct-LUN disk reports its size from the bound LUN
        return formatBytes(diskSizeBytes(attachment.disk))
      case 'storageDomain': {
        // Direct-LUN disks live on SAN backing, not a domain. The inline
        // storage_domains entries are id-only stubs on the collection read,
        // so names join from the cached inventory (useStorageDomainLookup).
        // Each ref cross-links to its domain detail page (id-less stubs keep
        // plain text); a shareable disk on several domains lists them all.
        if (attachment.disk?.storage_type === 'lun') return '—'
        const domainRefs = attachment.disk?.storage_domains?.storage_domain ?? []
        if (domainRefs.length === 0) return '—'
        return domainRefs.map((ref, index) => {
          const name = ref.name ?? storageDomainOf(ref.id)?.name ?? ref.id ?? '—'
          return (
            <span key={ref.id ?? index}>
              {index > 0 && ', '}
              {ref.id !== undefined ? (
                <Link to="/storage/$storageDomainId" params={{ storageDomainId: ref.id }}>
                  {name}
                </Link>
              ) : (
                name
              )}
            </span>
          )
        })
      }
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
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void disks.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
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
                {visibleColumns.map((column, index) => (
                  <ResizableTh
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    prefs={prefs}
                    sort={
                      column.sortValue !== undefined
                        ? thSort(
                            visibleColumns.map((c) => c.key),
                            index,
                          )
                        : undefined
                    }
                  >
                    {column.label}
                  </ResizableTh>
                ))}
                <Th screenReaderText={t('common.field.actions')} />
              </Tr>
            </Thead>
            <Tbody>
              {sortedDisks.map((attachment) => (
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
