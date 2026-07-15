import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  PageSection,
  Pagination,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { BarsIcon, DownloadIcon } from '@patternfly/react-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import { formatBytes, formatUptime, statusText, vmUptimeSeconds } from '../lib/format'
import { migrateVm } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { useNotify } from '../notifications/context'
import { useT } from '../i18n/useT'
import { downloadCsv, toCsv } from '../lib/csv'
import type { MessageId } from '../i18n/messages/en'
import { BulkActionsToolbar } from '../components/BulkActionsToolbar'
import { useContextMenu } from '../components/context-menu/ContextMenu'
import { BookmarkMenu } from '../components/list-toolbar/BookmarkMenu'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { ListPageHeader } from '../components/ListPageHeader'
import { MigrateVmButton } from '../components/MigrateModal'
import { QuickLookPanel } from '../components/QuickLookDrawer'
import { RefreshControl } from '../components/RefreshControl'
import { FolderTreePanel } from '../components/tags/FolderTreePanel'
import { TagManagerButton } from '../components/tags/TagManagerModal'
import { VmLabels } from '../components/tags/VmLabels'
import { CreateVmButton } from '../components/vm-create/CreateVmWizard'
import { ImportVmButton } from '../components/vm-import/ImportVmWizard'
import { VmActionsMenu } from '../components/VmActionsMenu'
import { VmWarnings } from '../components/VmWarnings'
import { VmStatusLabel } from '../components/VmStatusLabel'
import { useClustersInventory, useDataCenters } from '../hooks/useAdminResources'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useFolderParam } from '../hooks/useFolderParam'
import { useHosts } from '../hooks/useHosts'
import { folderPathOf, folderSubtreeIds, followedTagsOf, useTags } from '../hooks/useTags'
import { useVirtualRows } from '../hooks/useVirtualRows'
import { dragPropsFor } from '../hooks/useVmDragDrop'
import { useVmSearch } from '../hooks/useVmSearch'
import { useVms } from '../hooks/useVms'

// Above this many visible rows the table body is windowed (VITE_MOCK_SCALE /
// large-estate territory); at lab scale rendering stays plain and identical.
// With pagination capping a page at 100 rows this stays dormant — kept for a
// future "show all" escape hatch.
const VIRTUALIZE_THRESHOLD = 100

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// Host/cluster/DC names come from client-side joins against the cached
// inventories (the flat /vms list carries them as id-only links). The join
// queries are admin-gated, so user-tier sessions see an em dash — those
// columns start hidden anyway.
interface VmColumnCtx {
  hostName: (id: string | undefined) => string | undefined
  clusterName: (id: string | undefined) => string | undefined
  dataCenterName: (clusterId: string | undefined) => string | undefined
}

interface VmColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort: extract the comparable value (see hooks/useColumnSort)
  sortValue?: (vm: Vm, ctx: VmColumnCtx) => string | number | undefined
  // CSV export value for columns deliberately kept out of header sort (status)
  exportValue?: (vm: Vm, ctx: VmColumnCtx) => string | number | undefined
  cell: (vm: Vm, ctx: VmColumnCtx) => ReactNode
}

// vCPUs = sockets × cores × threads, legs defaulting to 1 like the engine
function vcpuCount(vm: Vm): number | undefined {
  const topology = vm.cpu?.topology
  if (!topology) return undefined
  return (topology.sockets ?? 1) * (topology.cores ?? 1) * (topology.threads ?? 1)
}

// Pickable data columns; the selection checkbox and actions kebab render
// unconditionally around them. Headers and cells both map over the same
// isVisible-filtered array so they can never desync.
const COLUMNS: VmColumn[] = [
  {
    key: 'name',
    labelId: 'vms.column.name',
    sortValue: (vm) => vm.name,
    always: true,
    cell: (vm) => (
      <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
        {vm.name}
      </Link>
    ),
  },
  {
    key: 'status',
    labelId: 'vms.column.status',
    exportValue: (vm) => vm.status,
    cell: (vm) => (
      <>
        <VmStatusLabel status={vm.status} />
        <VmWarnings vm={vm} />
      </>
    ),
  },
  {
    key: 'type',
    labelId: 'vms.column.type',
    sortValue: (vm) => vm.type,
    defaultHidden: true,
    cell: (vm) => statusText(vm.type),
  },
  // Rows pass the tags embedded in the list read (?follow=tags); VmLabels
  // only falls back to its per-VM query when the wrapper is absent (a live
  // engine that refused the follow).
  {
    key: 'labels',
    labelId: 'vms.column.labels',
    cell: (vm) => <VmLabels vmId={vm.id} tags={followedTagsOf(vm)} />,
  },
  {
    key: 'comment',
    labelId: 'vms.column.comment',
    sortValue: (vm) => vm.comment || undefined,
    defaultHidden: true,
    cell: (vm) => vm.comment || '—',
  },
  {
    key: 'host',
    labelId: 'vms.column.host',
    sortValue: (vm, ctx) => ctx.hostName(vm.host?.id),
    cell: (vm, ctx) => ctx.hostName(vm.host?.id) ?? '—',
  },
  {
    key: 'cluster',
    labelId: 'vms.column.cluster',
    sortValue: (vm, ctx) => ctx.clusterName(vm.cluster?.id),
    defaultHidden: true,
    cell: (vm, ctx) => ctx.clusterName(vm.cluster?.id) ?? '—',
  },
  {
    key: 'datacenter',
    labelId: 'vms.column.datacenter',
    sortValue: (vm, ctx) => ctx.dataCenterName(vm.cluster?.id),
    defaultHidden: true,
    cell: (vm, ctx) => ctx.dataCenterName(vm.cluster?.id) ?? '—',
  },
  {
    key: 'memory',
    labelId: 'vms.column.memory',
    sortValue: (vm) => vm.memory,
    cell: (vm) => formatBytes(vm.memory),
  },
  {
    key: 'vcpus',
    labelId: 'vms.column.vcpus',
    sortValue: (vm) => vcpuCount(vm),
    defaultHidden: true,
    cell: (vm) => vcpuCount(vm) ?? '—',
  },
  {
    key: 'graphics',
    labelId: 'vms.column.graphics',
    sortValue: (vm) => vm.display?.type,
    defaultHidden: true,
    cell: (vm) => (vm.display?.type ? vm.display.type.toUpperCase() : '—'),
  },
  {
    key: 'uptime',
    labelId: 'vms.column.uptime',
    sortValue: (vm) => (vm.status === 'up' ? vmUptimeSeconds(vm) : undefined),
    // elapsed.time statistic (seconds since the current run booted) — NOT
    // start_time, which the engine pins at creation/import; see vmUptimeSeconds
    cell: (vm) => (vm.status === 'up' ? formatUptime(vmUptimeSeconds(vm)) : '—'),
  },
  {
    key: 'created',
    labelId: 'vms.column.created',
    sortValue: (vm) => vm.creation_time,
    defaultHidden: true,
    cell: (vm) =>
      vm.creation_time !== undefined ? new Date(vm.creation_time).toLocaleDateString() : '—',
  },
  {
    key: 'fqdn',
    labelId: 'vms.column.fqdn',
    sortValue: (vm) => vm.fqdn,
    cell: (vm) => vm.fqdn ?? '—',
  },
  {
    key: 'description',
    labelId: 'vms.column.description',
    sortValue: (vm) => vm.description || undefined,
    cell: (vm) => vm.description || '—',
  },
]
// Deferred vs webadmin's grid: IP Addresses (needs guest-agent reported
// devices, not on the flat list), live CPU/Network percent (needs per-VM
// statistics — N×poll cost), K8s Namespace (kubevirt-only).

// A row click means "open the quick look" only when it lands on the row
// itself — links, buttons, and the selection checkbox (an <input> inside a
// <label>) keep their own behavior.
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, label') !== null
}

// Bulk live-migration mirrors useBulkVmAction: one migrate request per VM,
// Promise.allSettled (never rejects, so partial failure still reaches
// onSuccess), ONE aggregate toast and ONE ['vms'] invalidation. The engine's
// scheduler picks each destination — pinning a specific host is the per-row /
// detail Migrate button's job (its picker modal). Toast strings are hardcoded
// English by project convention.
function useBulkMigrate(): { run: (vms: Vm[]) => void; pending: boolean } {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  const mutation = useMutation({
    mutationFn: async (vms: Vm[]) => Promise.allSettled(vms.map((vm) => migrateVm(vm.id))),
    onSuccess: (results, vms) => {
      // allSettled preserves input order, so index i pairs with vms[i].
      const failedNames = vms
        .filter((_vm, index) => results[index].status === 'rejected')
        .map((vm) => vm.name)
      const succeeded = vms.length - failedNames.length

      if (failedNames.length === 0) {
        notify({
          title: `Migration requested for ${vms.length} VM${vms.length === 1 ? '' : 's'}`,
          variant: 'success',
        })
      } else {
        notify({
          title: `${succeeded} migrating, ${failedNames.length} failed: ${failedNames.join(', ')}`,
          variant: succeeded > 0 ? 'warning' : 'danger',
        })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })

  return {
    run: (vms) => {
      if (vms.length === 0) return
      mutation.mutate(vms)
    },
    pending: mutation.isPending,
  }
}

// Only 'up' VMs migrate (the engine rejects the rest), so — like the bulk
// lifecycle buttons — the button disables unless every selected VM is running.
function BulkMigrateBar({ selected }: { selected: Vm[] }) {
  const { run, pending } = useBulkMigrate()
  const t = useT()

  if (selected.length === 0) return null

  const allUp = selected.every((vm) => vm.status === 'up')

  return (
    <Toolbar style={{ paddingTop: 0 }}>
      <ToolbarContent>
        <ToolbarItem>
          <Button variant="secondary" isDisabled={pending || !allUp} onClick={() => run(selected)}>
            {t('common.action.migrate')}
          </Button>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  )
}

export function VmsPage() {
  // The search runs server-side (oVirt search DSL passthrough); the folder
  // filter then composes client-side on whatever the search returned.
  const { query, draft, setDraft, clear } = useVmSearch()
  const vms = useVms(query)
  const navigate = useNavigate()
  const t = useT()
  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('vms', columns)
  // Folder/tag management is admin-tier only (the engine would reject the
  // writes anyway); user tier keeps the read-only tree and filtering.
  const { isAdmin } = useCapabilities()

  // Applying a bookmark refills the input and publishes the query in one
  // step, skipping the typing debounce (mirrors useVmSearch's clear()).
  // setDraft must come along: publishing alone would leave any unsent draft
  // edits in place for the debounce to overwrite the bookmark with.
  const applyBookmark = (value: string) => {
    setDraft(value)
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, q: value || undefined }),
      replace: true,
    })
  }
  // Selected folder rides the URL ('folder' param) — deep-linkable, and
  // back/forward walk folder selections.
  const { folderId: selectedFolderId, setFolderId: setSelectedFolderId } = useFolderParam()
  const [isTreeOpen, setIsTreeOpen] = useState(true)
  // Selection is keyed by id so it survives the 10s poll replacing the Vm
  // objects; the toolbar gets fresh Vms derived from the visible list below.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  // Quick look likewise stores only the id — deriving the Vm from the query
  // data keeps the panel's status live, and a removed VM closes the drawer.
  const [quickLookVmId, setQuickLookVmId] = useState<string | null>(null)
  // Right-clicking a row opens the row kebab's item set at the cursor. ctx is
  // the Vm snapshot from the click (the menu lives seconds, so the 10s poll
  // replacing objects underneath doesn't matter); the target lives until that
  // menu (and any modal/mutation it owns) fully settles.
  const contextMenu = useContextMenu<Vm>()
  const menuTarget = contextMenu.target

  // Selecting a folder includes VMs tagged into its subfolders (the tree
  // renders them nested under it), so match against the whole subtree. The
  // rows embed their tags (listVms follows tags), so the filter is a
  // synchronous derivation — no per-VM tag queries. The toolbar's search DSL
  // does know 'tag=', but a folder selection means "any tag in the subtree",
  // an OR the ' and '-joined subset cannot express, so the tree filters
  // client-side on top of the server's search results. A VM without the
  // followed wrapper (an engine that refused the follow) drops out of
  // folder-filtered views; its VmLabels cell falls back to a per-VM query
  // either way.
  const tags = useTags()
  const folderIds =
    selectedFolderId === null ? null : folderSubtreeIds(tags.data ?? [], selectedFolderId)
  const visible =
    folderIds === null
      ? (vms.data ?? [])
      : (vms.data ?? []).filter((vm) =>
          (followedTagsOf(vm) ?? []).some((tag) => folderIds.has(tag.id)),
        )
  // the whole list holds back while the tag tree (the subtree set's input)
  // is still loading
  const isFiltering = selectedFolderId !== null && tags.isPending

  // id → name joins for the Host/Cluster/Data Center columns (admin-gated
  // queries; user tier renders an em dash and those columns start hidden)
  const hostsInventory = useHosts()
  const clustersInventory = useClustersInventory()
  const dataCentersInventory = useDataCenters()
  const columnCtx: VmColumnCtx = {
    hostName: (id) => hostsInventory.data?.find((h) => h.id === id)?.name,
    clusterName: (id) => clustersInventory.data?.find((c) => c.id === id)?.name,
    dataCenterName: (clusterId) => {
      const cluster = clustersInventory.data?.find((c) => c.id === clusterId)
      return dataCentersInventory.data?.find((dc) => dc.id === cluster?.data_center?.id)?.name
    },
  }

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // a new committed search or folder selection starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }
  const [prevFolder, setPrevFolder] = useState(selectedFolderId)
  if (selectedFolderId !== prevFolder) {
    setPrevFolder(selectedFolderId)
    setPage(1)
  }
  // Header sorting: no default — the engine's list order (or a SORTBY search
  // clause) stands until a header is clicked; a sort change starts back at
  // page 1 like a new search.
  const { sort, thSort } = useColumnSort()
  const [prevSort, setPrevSort] = useState(sort)
  if (sort !== prevSort) {
    setPrevSort(sort)
    setPage(1)
  }
  const sorted = sortRows(visible, sort, (vm, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(vm, columnCtx),
  )

  // Every filtered row × every visible sortable column (sortValue doubles as
  // the machine-readable export value); see lib/csv.ts for the quoting and
  // formula-injection posture.
  const exportCsv = () => {
    const exportColumns = columns
      .filter((column) => prefs.isVisible(column.key))
      .filter((column) => column.sortValue !== undefined || column.exportValue !== undefined)
    downloadCsv(
      `vms-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        exportColumns.map((column) => column.label),
        sorted.map((vm) =>
          exportColumns.map((column) => (column.sortValue ?? column.exportValue)?.(vm, columnCtx)),
        ),
      ),
    )
  }

  // Breadcrumb of the selected folder's ancestor chain; [] (unknown/stale id,
  // tag outside the folder subtree) hides it — the empty state's "Clear
  // folder selection" is the honest escape hatch there.
  const folderPath =
    selectedFolderId === null ? [] : folderPathOf(tags.data ?? [], selectedFolderId)

  // clamp rather than effect-reset: polling refetches (and folder filters)
  // can shrink the list underneath the current page
  const lastPage = Math.max(1, Math.ceil(sorted.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = sorted.slice((currentPage - 1) * perPage, currentPage * perPage)

  // Windowed rendering for large estates (VITE_MOCK_SCALE, big engines). The
  // hook is called unconditionally (rules of hooks) but stays inert below the
  // threshold: count 0 and no scroll container mounted.
  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const shouldVirtualize = paged.length > VIRTUALIZE_THRESHOLD
  const virtual = useVirtualRows(scrollParentRef, shouldVirtualize ? paged.length : 0)

  // The window (plus overscan) when virtualized, every row otherwise.
  // item.index addresses `paged`, so selection, quick look, and drag all
  // see the same Vm objects and row indexes on both paths.
  const windowedRows = shouldVirtualize
    ? virtual.items.map((item) => ({ vm: paged[item.index], rowIndex: item.index }))
    : paged.map((vm, rowIndex) => ({ vm, rowIndex }))

  // Filtered-out rows lose their checkbox, so they drop out of the bulk
  // selection too — acting on VMs the user can no longer see would surprise.
  const selected = visible.filter((vm) => selectedIds.has(vm.id))
  // "Add tag" from a selected row's menu applies to the whole checkbox selection
  const tagTargetsFor = (vm: Vm) =>
    selected.length > 1 && selectedIds.has(vm.id) ? selected : undefined
  const allSelected = paged.length > 0 && paged.every((vm) => selectedIds.has(vm.id))
  const quickLookVm = (vms.data ?? []).find((vm) => vm.id === quickLookVmId)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))
  // checkbox + pickable data columns + actions kebab (spacer-row colSpan)
  const columnCount = visibleColumns.length + 2

  const setVmSelected = (vm: Vm, isSelecting: boolean) => {
    setSelectedIds((ids) => {
      const next = new Set(ids)
      if (isSelecting) next.add(vm.id)
      else next.delete(vm.id)
      return next
    })
  }

  const table = (
    <>
      {(vms.isPending || isFiltering) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vms.loading')} />
        </>
      )}

      {vms.isError && (
        <EmptyState titleText={t('vms.error.title')} status="danger">
          <EmptyStateBody>
            {vms.error instanceof Error ? vms.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void vms.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {vms.isSuccess && !isFiltering && visible.length === 0 && query !== '' && (
        <EmptyState titleText={t('vms.searchEmpty.title')}>
          <EmptyStateBody>
            <FormattedMessage
              id="vms.searchEmpty.matches"
              values={{ query: <code>{query}</code> }}
            />
            {selectedFolderId !== null && <FormattedMessage id="folders.searchEmpty.suffix" />}.
          </EmptyStateBody>
          <Button variant="link" onClick={clear}>
            {t('common.action.clearSearch')}
          </Button>
        </EmptyState>
      )}

      {vms.isSuccess && !isFiltering && visible.length === 0 && query === '' && (
        <EmptyState
          titleText={
            selectedFolderId !== null ? t('folders.emptyState.title') : t('vms.empty.title')
          }
        >
          <EmptyStateBody>
            {selectedFolderId !== null ? (
              <FormattedMessage id="folders.emptyState.body" />
            ) : (
              t('vms.empty.body')
            )}
          </EmptyStateBody>
          {selectedFolderId !== null && (
            <Button variant="link" onClick={() => setSelectedFolderId(null)}>
              <FormattedMessage id="folders.emptyState.clear" />
            </Button>
          )}
        </EmptyState>
      )}

      {vms.isSuccess && !isFiltering && visible.length > 0 && (
        // Always the scroll parent ref's home; it only becomes an actual
        // scroll container (bounding the windowed rows) above the threshold —
        // below it this is an unstyled div in normal flow.
        <div
          ref={scrollParentRef}
          style={shouldVirtualize ? { maxHeight: '70vh', overflowY: 'auto' } : undefined}
        >
          <div className="app-table-viewport">
            <Table
              aria-label={t('vms.table.ariaLabel')}
              variant="compact"
              {...resizableTableProps(prefs)}
            >
              <Thead>
                <Tr>
                  <Th
                    aria-label={t('vms.selectAll')}
                    select={{
                      isSelected: allSelected,
                      onSelect: (_event, isSelecting) =>
                        setSelectedIds(isSelecting ? new Set(paged.map((vm) => vm.id)) : new Set()),
                    }}
                  />
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
                  <Th screenReaderText={t('vms.actions')} />
                </Tr>
              </Thead>
              <Tbody>
                {/* spacer rows keep the scrollbar honest while only the window
                (plus overscan) actually renders — see useVirtualRows */}
                {shouldVirtualize && virtual.topSpacerHeight > 0 && (
                  <Tr aria-hidden="true">
                    <Td
                      colSpan={columnCount}
                      style={{ height: virtual.topSpacerHeight, padding: 0 }}
                    />
                  </Tr>
                )}
                {windowedRows.map(({ vm, rowIndex }) => (
                  <Tr
                    key={vm.id}
                    isClickable
                    isRowSelected={selectedIds.has(vm.id)}
                    // measureRow reads data-index to refine the row-height
                    // estimate (rows with wrapping label groups run taller)
                    data-index={rowIndex}
                    ref={shouldVirtualize ? virtual.measureRow : undefined}
                    // dragging a row that is part of the selection drags the
                    // whole selection; user tier gets no drag sources at all
                    {...(isAdmin ? dragPropsFor(vm, selected) : {})}
                    onClick={(event) => {
                      // The kebab's confirm modals (and MoveToFolderModal) sit
                      // under this Tr in the React tree but portal to
                      // document.body, so their clicks bubble here through React;
                      // the contains() check keeps those from opening the drawer.
                      if (
                        event.target instanceof Node &&
                        event.currentTarget.contains(event.target) &&
                        !isInteractiveTarget(event.target)
                      ) {
                        setQuickLookVmId(vm.id)
                      }
                    }}
                    // isClickable makes the row focusable; PF's own onRowClick
                    // would preventDefault Enter/Space even on the checkbox and
                    // links inside, so wire the keys by hand, row-target only
                    onKeyDown={(event) => {
                      if (
                        (event.key === 'Enter' || event.key === ' ') &&
                        event.target === event.currentTarget
                      ) {
                        event.preventDefault()
                        setQuickLookVmId(vm.id)
                      }
                    }}
                    onContextMenu={(event) => contextMenu.open(event, vm)}
                  >
                    <Td
                      select={{
                        rowIndex,
                        isSelected: selectedIds.has(vm.id),
                        onSelect: (_event, isSelecting) => setVmSelected(vm, isSelecting),
                      }}
                    />
                    {visibleColumns.map((column) => (
                      <Td key={column.key} dataLabel={column.label}>
                        {column.cell(vm, columnCtx)}
                      </Td>
                    ))}
                    <Td dataLabel={t('vms.actions')} isActionCell>
                      {/* Reuses the detail header's Migrate button as-is (self-
                        gates to admin + a running VM, so most rows show only
                        the kebab); it owns the destination-host picker modal. */}
                      <MigrateVmButton vm={vm} />
                      <VmActionsMenu vm={vm} tagTargets={tagTargetsFor(vm)} />
                    </Td>
                  </Tr>
                ))}
                {shouldVirtualize && virtual.bottomSpacerHeight > 0 && (
                  <Tr aria-hidden="true">
                    <Td
                      colSpan={columnCount}
                      style={{ height: virtual.bottomSpacerHeight, padding: 0 }}
                    />
                  </Tr>
                )}
              </Tbody>
            </Table>
          </div>
        </div>
      )}

      {/* Right-click twin of the row kebab: the same dual-mode menu component
          rendered once at the cursor with this page's kebab props (plain vm),
          keyed by token so re-opening (same or another row) remounts fresh. */}
      {menuTarget !== null && (
        <VmActionsMenu
          key={`${menuTarget.ctx.id}-${menuTarget.token}`}
          vm={menuTarget.ctx}
          tagTargets={tagTargetsFor(menuTarget.ctx)}
          contextMenu={{ position: menuTarget.position, onClose: contextMenu.close }}
        />
      )}
    </>
  )

  return (
    <PageSection>
      <ListPageHeader
        title={t('vms.title')}
        actions={
          <>
            {isAdmin && <TagManagerButton />}
            {/* Import is admin-tier: the wizard's cluster/host pickers ride
                admin-gated inventories and the engine rejects user-tier
                imports anyway (same posture as TagManagerButton). */}
            {isAdmin && <ImportVmButton />}
            <CreateVmButton />
          </>
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarItem>
            <Button
              variant="plain"
              aria-label={t(isTreeOpen ? 'folders.tree.toggle.hide' : 'folders.tree.toggle.show')}
              icon={<BarsIcon />}
              onClick={() => setIsTreeOpen((open) => !open)}
            />
          </ToolbarItem>
          <ToolbarItem style={{ width: '22rem' }}>
            <SearchInput
              value={draft}
              onChange={setDraft}
              // useVmSearch debounces the draft into the URL — commit is
              // handled there, Enter has nothing extra to publish
              onCommit={() => {}}
              hint={t('vms.search.hint')}
              ariaLabel={t('vms.search.ariaLabel')}
              trailing={<BookmarkMenu area="vms" currentQuery={query} onApply={applyBookmark} />}
            />
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
                titles={{ paginationAriaLabel: t('vms.pagination.ariaLabel') }}
              />
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="link"
                icon={<DownloadIcon />}
                onClick={exportCsv}
                isDisabled={sorted.length === 0}
              >
                {t('action.exportCsv')}
              </Button>
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

      {/* renders nothing until at least one row is checked */}
      <BulkActionsToolbar selected={selected} onClear={() => setSelectedIds(new Set())} />
      {/* Bulk migrate lives in its own strip because BulkActionsToolbar is
          owned elsewhere; admin-only, like the per-row/detail Migrate. */}
      {isAdmin && <BulkMigrateBar selected={selected} />}

      <Flex
        flexWrap={{ default: 'nowrap' }}
        alignItems={{ default: 'alignItemsStretch' }}
        spaceItems={{ default: 'spaceItemsLg' }}
      >
        {isTreeOpen && (
          <FlexItem style={{ flexBasis: '16rem', flexShrink: 0 }}>
            <FolderTreePanel
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
              entities={vms.data ?? []}
            />
          </FlexItem>
        )}
        <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
          {folderPath.length > 0 && (
            <Breadcrumb
              aria-label={t('folders.breadcrumb.ariaLabel')}
              style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
            >
              <BreadcrumbItem component="button" onClick={() => setSelectedFolderId(null)}>
                <FormattedMessage id="folders.tree.allVms" />
              </BreadcrumbItem>
              {folderPath.map((folder, index) =>
                index === folderPath.length - 1 ? (
                  <BreadcrumbItem key={folder.id} isActive>
                    {folder.name}
                  </BreadcrumbItem>
                ) : (
                  <BreadcrumbItem
                    key={folder.id}
                    component="button"
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    {folder.name}
                  </BreadcrumbItem>
                ),
              )}
            </Breadcrumb>
          )}
          <Drawer isExpanded={quickLookVm !== undefined}>
            <DrawerContent
              panelContent={
                quickLookVm !== undefined ? (
                  <QuickLookPanel vm={quickLookVm} onClose={() => setQuickLookVmId(null)} />
                ) : undefined
              }
            >
              <DrawerContentBody>{table}</DrawerContentBody>
            </DrawerContent>
          </Drawer>
        </FlexItem>
      </Flex>
    </PageSection>
  )
}
