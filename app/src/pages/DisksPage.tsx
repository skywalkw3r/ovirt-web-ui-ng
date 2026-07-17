import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  // Label stays for the categorical LUN type badge — the status icon is only
  // for states; the Status column uses DiskStatusLabel.
  Label,
  PageSection,
  Pagination,
  Skeleton,
  Flex,
  FlexItem,
  FormSelect,
  FormSelectOption,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { diskSizeBytes, type Disk } from '../api/schemas/disk'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import {
  copyDisabledReasonId,
  editDisabledReasonId,
  moveDisabledReasonId,
  removeDisabledReasonId,
  sparsifyDisabledReasonId,
} from '../lib/diskActionGuards'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { DiskStatusLabel } from '../components/DiskStatusLabel'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { DiskFormModal } from '../components/disk-form/DiskFormModal'
import { MoveCopyDiskModal, type MoveCopyMode } from '../components/disk-form/MoveCopyDiskModal'
import { UploadImageModal } from '../components/disk-form/UploadImageModal'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useAllDisks } from '../hooks/useCatalogPages'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import {
  useCopyDisk,
  useDeleteDisk,
  useDownloadDisk,
  useMoveDisk,
  useSparsifyDisk,
} from '../hooks/useDiskMutations'
import { useListSearch } from '../hooks/useListSearch'
import { useStorageDomains } from '../hooks/useStorageDomains'
import {
  diskContentTypeText,
  diskFormatText,
  diskStorageTypeText,
  formatBytes,
} from '../lib/format'

// oVirt disk states are ok/locked/illegal; anything unrecognized stays grey.
// Colored icon per state (matching the storage-domain status treatment):
// locked is a transient operation (blue in-progress), illegal a hard fault.

// Storage-domain names come from a client-side join against the cached
// /storagedomains inventory (the flat /disks list carries storage_domains as
// id-only links; a list-wide ?follow= is avoided per the live-engine quirk).
interface DiskColumnCtx {
  storageDomainName: (id: string | undefined) => string | undefined
  t: ReturnType<typeof useT>
}

interface DiskColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (disk: Disk, ctx: DiskColumnCtx) => string | number | undefined
  cell: (disk: Disk, ctx: DiskColumnCtx) => ReactNode
}

// Webadmin MainDiskView column set (labels from gwt-common
// CommonApplicationConstants), trimmed via the picker. Headers and cells both
// map over the same isVisible-filtered array so they can never desync.
const COLUMNS: DiskColumn[] = [
  {
    key: 'alias',
    labelId: 'disks.column.alias',
    sortValue: (disk) => disk.alias ?? disk.name,
    always: true,
    // webadmin's grid keys disks by alias; the flat list may carry only name
    cell: (disk) => (
      <Link to="/disks/$diskId" params={{ diskId: disk.id }}>
        {disk.alias ?? disk.name ?? '—'}
      </Link>
    ),
  },
  {
    key: 'id',
    labelId: 'disks.column.id',
    sortValue: (disk) => disk.id,
    defaultHidden: true,
    cell: (disk) => disk.id,
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (disk) => disk.comment || undefined,
    defaultHidden: true,
    cell: (disk) => disk.comment || '—',
  },
  {
    key: 'shareable',
    labelId: 'disks.column.shareable',
    sortValue: (disk) => (disk.shareable === undefined ? undefined : disk.shareable ? 1 : 0),
    // webadmin renders this as a tiny icon column; as text it earns opt-in only
    defaultHidden: true,
    cell: (disk, ctx) =>
      disk.shareable === undefined
        ? '—'
        : disk.shareable
          ? ctx.t('common.yes')
          : ctx.t('common.no'),
  },
  {
    key: 'storageDomains',
    labelId: 'disks.column.storageDomains',
    sortValue: (disk, ctx) => {
      const names = (disk.storage_domains?.storage_domain ?? [])
        .map((sd) => sd.name ?? ctx.storageDomainName(sd.id))
        .filter((name): name is string => name !== undefined)
      return names.length > 0 ? names.join(', ') : undefined
    },
    cell: (disk, ctx) => {
      const names = (disk.storage_domains?.storage_domain ?? [])
        .map((sd) => sd.name ?? ctx.storageDomainName(sd.id))
        .filter((name): name is string => name !== undefined)
      // LUN disks live on no storage domain — em dash, matching webadmin
      return names.length > 0 ? names.join(', ') : '—'
    },
  },
  {
    key: 'provisionedSize',
    labelId: 'disks.column.virtualSize',
    sortValue: (disk) => diskSizeBytes(disk),
    // direct-LUN disks have no image size — diskSizeBytes falls back to the
    // bound LUN's size, matching webadmin's LunDisk size column
    cell: (disk) => formatBytes(diskSizeBytes(disk)),
  },
  {
    key: 'actualSize',
    labelId: 'disks.column.actualSize',
    sortValue: (disk) => disk.actual_size,
    // not on webadmin's main grid (its storage subtabs carry it) but the flat
    // list already ships the figure — offered as an opt-in
    defaultHidden: true,
    cell: (disk) => formatBytes(disk.actual_size),
  },
  {
    key: 'allocation',
    labelId: 'disks.column.allocation',
    sortValue: (disk) =>
      disk.sparse === undefined ? undefined : disk.sparse ? 'thin' : 'preallocated',
    // webadmin renders VolumeType (Sparse → 'Thin', 'Preallocated'); REST
    // carries it as the boolean `sparse`, absent on LUN disks → em dash
    cell: (disk, ctx) =>
      disk.sparse === undefined
        ? '—'
        : disk.sparse
          ? ctx.t('disks.alloc.thin')
          : ctx.t('disks.alloc.preallocated'),
  },
  {
    key: 'status',
    labelId: 'common.field.status',
    cell: (disk) => <DiskStatusLabel status={disk.status} />,
  },
  {
    key: 'storageType',
    labelId: 'common.field.type',
    sortValue: (disk) => disk.storage_type,
    // 'image' | 'lun' | 'managed_block_storage' — webadmin's Type column.
    // Direct-LUN disks get a badge so external storage stands out in the grid.
    // Off by default (user-tuned column set): almost every disk is 'image',
    // so the column is noise until direct LUNs enter the picture.
    defaultHidden: true,
    cell: (disk, ctx) =>
      disk.storage_type === 'lun' ? (
        <Label isCompact color="purple">
          {ctx.t('disk.lun.badge')}
        </Label>
      ) : (
        diskStorageTypeText(disk.storage_type)
      ),
  },
  {
    key: 'contentType',
    labelId: 'disks.column.content',
    sortValue: (disk) => disk.content_type,
    cell: (disk) => diskContentTypeText(disk.content_type),
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (disk) => disk.description || undefined,
    cell: (disk) => disk.description || '—',
  },
  {
    key: 'format',
    labelId: 'disks.column.format',
    sortValue: (disk) => disk.format,
    // not a webadmin grid column (details-only there); kept from the old set
    defaultHidden: true,
    cell: (disk) => diskFormatText(disk.format),
  },
]
// Deferred vs webadmin's grid: Attached To (nothing about attachments rides
// the flat /disks list — needs per-disk /disks/{id}/vms, an N+1),
// Creation Date / Last Modified (DiskImage GWT-RPC fields the REST Disk
// entity does not expose), Quota (bare id link on the flat list, no cached
// quota inventory to join), LUN ID/Serial/Vendor/Product (webadmin shows
// them only in its LUN-only radio view).

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// --- Action gating (webadmin DiskOperationsHelper / VmDiskListModel rules) ----
// The pure rules live in lib/diskActionGuards (shared with the VM Disks tab so
// direct-LUN/locked gating stays consistent); each returns a MessageId the
// wrappers below localize into the kebab item's description/tooltip.

function reasonText(
  reasonId: MessageId | undefined,
  t: ReturnType<typeof useT>,
): string | undefined {
  return reasonId === undefined ? undefined : t(reasonId)
}

// Download (imageio) gating — image disks in OK status only: a direct-LUN or
// managed-block disk has no image to stream, and a non-OK disk isn't
// transferable. Kept local rather than in the shared diskActionGuards module
// (which the move/copy/sparsify/edit/remove rules live in) because download is
// a Disks-page-only action.
function downloadDisabledReasonId(disk: Disk): MessageId | undefined {
  if (disk.status === 'locked') return 'disks.disabled.locked'
  if (disk.status !== 'ok') return 'disks.disabled.notOk'
  if (disk.storage_type !== 'image') return 'disks.disabled.downloadImageOnly'
  return undefined
}

function diskLabel(disk: Disk): string {
  return disk.alias ?? disk.name ?? disk.id
}

// Mounted only for the admin tier (gate below), so user tier never fires the
// /disks request the engine would answer with a permission fault. The search
// toolbar rides along in here so its UI is gated with the list it drives.
function DisksTable() {
  const t = useT()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const disks = useAllDisks(query)
  // id → name join for Storage Domain(s) (already cached app-wide; the flat
  // /disks list carries storage_domains as id-only links)
  const storageDomains = useStorageDomains()
  const columnCtx: DiskColumnCtx = {
    storageDomainName: (id) => storageDomains.data?.find((sd) => sd.id === id)?.name,
    t,
  }
  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, label: t(c.labelId) })), [t])
  const prefs = useColumnPrefs('disks', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  const move = useMoveDisk()
  const copy = useCopyDisk()
  const sparsify = useSparsifyDisk()
  const remove = useDeleteDisk()
  // Download is a multi-step imageio flow, not a useMutation — it exposes the
  // row id whose transfer is being prepared so that row's Download item can
  // disable while it opens (a few seconds), without freezing the whole kebab.
  const { download: startDownload, downloadingId } = useDownloadDisk()
  const mutating = move.isPending || copy.isPending || sparsify.isPending || remove.isPending

  // Toolbar Upload wizard.
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  // New-disk form modal (create mode — the modal owns the create mutation).
  const [isNewOpen, setIsNewOpen] = useState(false)
  // Edit form modal, pointed at the row's disk (edit mode — the modal owns the
  // update mutation). The same DiskFormModal renders create vs edit off the
  // presence of `disk`.
  const [editing, setEditing] = useState<Disk | null>(null)
  // Move/Copy form modal (mode discriminates the two flows sharing the form).
  const [moveCopy, setMoveCopy] = useState<{ mode: MoveCopyMode; disk: Disk } | null>(null)
  // Sparsify runs through the destructive-action ConfirmModal (project rule:
  // long-running/destructive ⇒ confirm), even though webadmin shows no dialog.
  const [sparsifying, setSparsifying] = useState<Disk | null>(null)
  // Remove runs through the destructive-action ConfirmModal (danger variant).
  const [removing, setRemoving] = useState<Disk | null>(null)

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  // Webadmin's disk-grid filter row: the storage kind as a toggle strip
  // (All / Images / Direct LUN / Managed Block) and the content type as a
  // dropdown — both client-side over the committed search result, exactly
  // like the old admin portal's disk tab.
  const [diskType, setDiskType] = useState<'all' | 'image' | 'lun' | 'managed_block_storage'>('all')
  const [contentType, setContentType] = useState('all')
  // dropdown options follow the data (plus All), so oddball engine values
  // still filter correctly
  const contentTypes = [
    ...new Set(
      (disks.data ?? [])
        .map((disk) => disk.content_type)
        .filter((value): value is string => value !== undefined),
    ),
  ].sort()
  // a filter change re-scopes the whole list — start back at page 1
  const [prevDiskFilter, setPrevDiskFilter] = useState(`${diskType}/${contentType}`)
  if (`${diskType}/${contentType}` !== prevDiskFilter) {
    setPrevDiskFilter(`${diskType}/${contentType}`)
    setPage(1)
  }

  const filtered = (disks.data ?? []).filter(
    (disk) =>
      // a disk without storage_type is an image (the engine default)
      (diskType === 'all' || (disk.storage_type ?? 'image') === diskType) &&
      (contentType === 'all' || disk.content_type === contentType),
  )

  const visible = sortRows(filtered, sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row, columnCtx),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = visible.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  return (
    <>
      <ListPageHeader
        title={t('disks.title')}
        actions={
          <>
            <Button variant="primary" onClick={() => setIsNewOpen(true)}>
              {t('disks.new')}
            </Button>
            <Button variant="secondary" onClick={() => setIsUploadOpen(true)}>
              {t('disks.upload')}
            </Button>
          </>
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* One flex row so the filter strip sits right beside the search box
              (independent ToolbarItems drift apart under the toolbar's own
              spacing); the dropdown carries a visible label, webadmin-style. */}
          <ToolbarItem>
            <Flex
              alignItems={{ default: 'alignItemsCenter' }}
              gap={{ default: 'gapMd' }}
              flexWrap={{ default: 'nowrap' }}
            >
              {/* wide enough to keep the DSL example placeholder readable */}
              <FlexItem style={{ width: '22rem' }}>
                <SearchInput
                  value={draft}
                  onChange={setDraft}
                  onCommit={commit}
                  hint={t('disks.search.hint')}
                  ariaLabel={t('disks.search.ariaLabel')}
                />
              </FlexItem>
              <FlexItem>
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
              </FlexItem>
              <FlexItem>
                <Flex
                  alignItems={{ default: 'alignItemsCenter' }}
                  gap={{ default: 'gapSm' }}
                  flexWrap={{ default: 'nowrap' }}
                >
                  <label htmlFor="disks-content-type" style={{ whiteSpace: 'nowrap' }}>
                    {t('disks.filter.contentType')}
                  </label>
                  <FormSelect
                    id="disks-content-type"
                    value={contentType}
                    onChange={(_event, value) => setContentType(value)}
                    style={{ minWidth: '9rem' }}
                  >
                    <FormSelectOption value="all" label={t('common.filter.all')} />
                    {contentTypes.map((value) => (
                      <FormSelectOption
                        key={value}
                        value={value}
                        label={diskContentTypeText(value)}
                      />
                    ))}
                  </FormSelect>
                </Flex>
              </FlexItem>
            </Flex>
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem variant="pagination">
              <Pagination
                isCompact
                variant="top"
                itemCount={visible.length}
                page={currentPage}
                perPage={perPage}
                perPageOptions={PER_PAGE_OPTIONS}
                onSetPage={(_event, nextPage) => setPage(nextPage)}
                onPerPageSelect={(_event, nextPerPage, nextPage) => {
                  setPerPage(nextPerPage)
                  setPage(nextPage)
                }}
                titles={{ paginationAriaLabel: t('disks.pagination.ariaLabel') }}
              />
            </ToolbarItem>
            <ToolbarItem>
              <ColumnPicker
                columns={columns}
                isVisible={prefs.isVisible}
                onToggle={prefs.toggle}
                onReset={prefs.reset}
              />
            </ToolbarItem>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {disks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('disks.loading')} />
        </>
      )}

      {disks.isError && (
        <EmptyState titleText={t('disks.error.title')} status="danger">
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

      {disks.isSuccess && visible.length === 0 && (
        <EmptyState
          titleText={query !== '' ? t('disks.searchEmpty.title') : t('disks.empty.title')}
        >
          <EmptyStateBody>
            {query !== '' ? t('disks.searchEmpty.body') : t('disks.empty.body')}
          </EmptyStateBody>
          {query !== '' && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="link" onClick={() => apply('')}>
                  {t('common.action.clearSearch')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      )}

      {disks.isSuccess && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('disks.table.ariaLabel')}
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
              {paged.map((disk) => {
                const moveReason = reasonText(moveDisabledReasonId(disk), t)
                const copyReason = reasonText(copyDisabledReasonId(disk), t)
                const sparsifyReason = reasonText(sparsifyDisabledReasonId(disk), t)
                const editReason = reasonText(editDisabledReasonId(disk), t)
                const removeReason = reasonText(removeDisabledReasonId(disk), t)
                const downloadReason = reasonText(downloadDisabledReasonId(disk), t)
                return (
                  <Tr key={disk.id}>
                    {visibleColumns.map((column) => (
                      <Td key={column.key} dataLabel={column.label}>
                        {column.cell(disk, columnCtx)}
                      </Td>
                    ))}
                    <Td dataLabel={t('common.field.actions')} isActionCell>
                      <ActionsColumn
                        isDisabled={mutating}
                        items={[
                          {
                            title: t('common.action.edit'),
                            isDisabled: editReason !== undefined,
                            description: editReason,
                            onClick: () => setEditing(disk),
                          },
                          {
                            title: t('common.action.move'),
                            isDisabled: moveReason !== undefined,
                            description: moveReason,
                            onClick: () => setMoveCopy({ mode: 'move', disk }),
                          },
                          {
                            title: t('vmDisks.action.copy'),
                            isDisabled: copyReason !== undefined,
                            description: copyReason,
                            onClick: () => setMoveCopy({ mode: 'copy', disk }),
                          },
                          {
                            title: t('disk.action.download'),
                            isDisabled: downloadReason !== undefined || downloadingId === disk.id,
                            description: downloadReason,
                            onClick: () => void startDownload(disk),
                          },
                          {
                            title: t('disks.action.sparsify'),
                            isDanger: true,
                            isDisabled: sparsifyReason !== undefined,
                            description: sparsifyReason,
                            onClick: () => setSparsifying(disk),
                          },
                          { isSeparator: true },
                          {
                            title: t('common.action.remove'),
                            isDanger: true,
                            isDisabled: removeReason !== undefined,
                            description: removeReason,
                            onClick: () => setRemoving(disk),
                          },
                        ]}
                      />
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}

      {isNewOpen && <DiskFormModal onClose={() => setIsNewOpen(false)} />}

      {editing && <DiskFormModal disk={editing} onClose={() => setEditing(null)} />}

      {isUploadOpen && <UploadImageModal onClose={() => setIsUploadOpen(false)} />}

      {moveCopy && (
        <MoveCopyDiskModal
          mode={moveCopy.mode}
          disk={moveCopy.disk}
          onSubmit={({ storageDomainId, name }) => {
            const { mode, disk } = moveCopy
            setMoveCopy(null)
            if (mode === 'move') move.mutate({ id: disk.id, storageDomainId })
            else copy.mutate({ id: disk.id, storageDomainId, name })
          }}
          onClose={() => setMoveCopy(null)}
        />
      )}

      {sparsifying && (
        <ConfirmModal
          isOpen
          title={t('disks.sparsify.confirm.title', { name: diskLabel(sparsifying) })}
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

      {removing && (
        <ConfirmModal
          isOpen
          title={t('disks.remove.confirm.title', { name: diskLabel(removing) })}
          body={t('disks.remove.confirm.body', { name: diskLabel(removing) })}
          confirmLabel={t('common.action.remove')}
          onConfirm={() => {
            const disk = removing
            setRemoving(null)
            remove.mutate(disk.id)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

export function DisksPage() {
  const t = useT()
  // Admin-gated (AppShell marks /disks adminOnly). Skeletons cover the
  // pre-profile window (loaded=false) instead of flashing the lock at users
  // who will turn out to be admins.
  const { isAdmin, loaded } = useCapabilities()

  // The admin table owns its own ListPageHeader (with the New/Upload actions and
  // the toolbar RefreshControl) so the create/upload state stays colocated with
  // the table it drives.
  if (loaded && isAdmin) {
    return (
      <PageSection>
        <DisksTable />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader title={t('disks.title')} />

      {!loaded && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('disks.loading')} />
        </>
      )}

      {loaded && !isAdmin && <NotPermitted what={t('disks.notPermitted')} />}
    </PageSection>
  )
}
