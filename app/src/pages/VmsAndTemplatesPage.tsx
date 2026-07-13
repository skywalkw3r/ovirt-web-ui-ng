import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Alert,
  AlertActionLink,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  PageSection,
  Pagination,
  Skeleton,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import {
  BarsIcon,
  DownloadIcon,
  FolderIcon,
  LayerGroupIcon,
  VirtualMachineIcon,
} from '@patternfly/react-icons'
import { useNavigate } from '@tanstack/react-router'
import { FormattedMessage } from 'react-intl'
import type { Vm } from '../api/schemas/vm'
import { useCapabilities } from '../auth/capabilities'
import { useContextMenu } from '../components/context-menu/ContextMenu'
import { InventoryTreeSidebar } from '../components/InventoryTreeSidebar'
import { InventoryViewSwitcher } from '../components/InventoryViewSwitcher'
import { ListPageHeader } from '../components/ListPageHeader'
import { BookmarkMenu } from '../components/list-toolbar/BookmarkMenu'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { RefreshControl } from '../components/RefreshControl'
import { FolderTreePanel } from '../components/tags/FolderTreePanel'
import { TagManagerButton } from '../components/tags/TagManagerModal'
import { TemplateActionsMenu } from '../components/template-actions/TemplateActionsMenu'
import { ImportVmButton } from '../components/vm-import/ImportVmWizard'
import { VmActionsMenu } from '../components/VmActionsMenu'
import {
  rowEntity,
  VM_LIST_COLUMNS,
  type VmListColumn,
  type VmListCtx,
  type VmListRow,
} from '../components/vmListColumns'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useFolderParam } from '../hooks/useFolderParam'
import { useTemplatesList } from '../hooks/useCatalogPages'
import { folderPathOf, folderSubtreeIds, followedTagsOf, useTags } from '../hooks/useTags'
import { mixedDragPropsFor } from '../hooks/useVmDragDrop'
import { useClustersInventory, useDataCenters } from '../hooks/useAdminResources'
import { useHosts } from '../hooks/useHosts'
import { useVms } from '../hooks/useVms'
import { useT } from '../i18n/useT'
import { downloadCsv, toCsv } from '../lib/csv'

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// session-scoped view memory for the folder selection (see the restore effect)
const FOLDER_MEMORY_KEY = 'console-inventory-folder'

// kind-namespaced row identity — Tr keys, the multi-select set and the drag
// payload split all speak this one format
const rowKeyOf = (row: VmListRow) => `${row.kind}-${rowEntity(row).id}`

// A row click means "select the row" only when it lands on the row itself —
// links, buttons and the kebab keep their own behavior (same helper as
// VmsPage's quick-look rows).
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, label') !== null
}

// The pickable columns are the shared VM-list catalog (vmListColumns — the
// Hosts & Clusters scoped-VM table renders the same set, keeping the two
// views' defaults in lockstep) plus the view-local Type column: only this
// mixed VM/template table needs a kind discriminator, so it deliberately
// stays out of the shared catalog. Headers and cells both map over the same
// isVisible-filtered array so they can never desync (area 'inventory').
const COLUMNS: VmListColumn[] = [
  ...VM_LIST_COLUMNS,
  {
    key: 'type',
    labelId: 'inventory.column.type',
    width: 10,
    modifier: 'nowrap',
    sortValue: (row) => row.kind,
    cell: (row) => (
      <Flex
        gap={{ default: 'gapSm' }}
        alignItems={{ default: 'alignItemsCenter' }}
        flexWrap={{ default: 'nowrap' }}
      >
        {/* flexShrink:0 keeps the glyph from collapsing to 0 width when the
            nowrap cell is narrow — 'Template' would otherwise squeeze it out */}
        {row.kind === 'vm' ? (
          <VirtualMachineIcon style={{ flexShrink: 0 }} />
        ) : (
          <LayerGroupIcon style={{ flexShrink: 0 }} />
        )}
        <FormattedMessage
          id={row.kind === 'vm' ? 'inventory.kind.vm' : 'inventory.kind.template'}
        />
      </Flex>
    ),
  },
]

export function VmsAndTemplatesPage() {
  const vms = useVms()
  const templates = useTemplatesList()
  const tags = useTags()
  const t = useT()
  // Folder/tag management is admin-tier only; user tier keeps the read-only
  // tree and filtering — same posture as VmsPage.
  const { isAdmin } = useCapabilities()
  // admin-gated inventories backing the legacy-parity join columns
  const hostsQuery = useHosts()
  const clustersQuery = useClustersInventory()
  const dataCentersQuery = useDataCenters()

  const { folderId: selectedFolderId, setFolderId: setSelectedFolderId } = useFolderParam()
  // Session-scoped view memory: coming back to this view — typically via the
  // inventory switcher — restores the last folder selection instead of
  // resetting to All. The URL param stays the source of truth: a deep link
  // with ?folder= wins, only a bare visit restores, and the restore replaces
  // (not pushes) so Back still leaves the page in one step.
  const navigate = useNavigate()
  const restoredFolder = useRef(false)
  useEffect(() => {
    if (!restoredFolder.current) {
      restoredFolder.current = true
      const stored = sessionStorage.getItem(FOLDER_MEMORY_KEY)
      if (selectedFolderId === null && stored !== null) {
        void navigate({
          to: '.',
          search: (prev: Record<string, unknown>) => ({ ...prev, folder: stored }),
          replace: true,
        })
        return
      }
    }
    if (selectedFolderId === null) sessionStorage.removeItem(FOLDER_MEMORY_KEY)
    else sessionStorage.setItem(FOLDER_MEMORY_KEY, selectedFolderId)
  }, [selectedFolderId, navigate])
  const [isTreeOpen, setIsTreeOpen] = useState(true)
  // One right-click menu per surface: right-clicking a row (VM or template)
  // opens that row's kebab item set at the cursor. ctx carries the whole row
  // so the render below picks the matching dual-mode menu; the target lives
  // until that menu (and any modal/mutation it owns) fully settles.
  const contextMenu = useContextMenu<VmListRow>()
  const menuTarget = contextMenu.target
  // Webadmin-style row multi-select: plain click selects a row, Ctrl/Cmd
  // toggles it, Shift extends from the anchor over the current sorted order;
  // the whole selection then drags into the folder tree as ONE payload
  // (mixedDragPropsFor — VMs and templates ride separate channels of the
  // same drop). Admin-gated like the drag sources themselves.
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
  const [anchorKey, setAnchorKey] = useState<string | null>(null)
  // Client-side name filter — the combined view has no server DSL passthrough
  // (two collections behind one box would need two dialects; the dedicated
  // list pages keep the full search).
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // useColumnPrefs takes localized labels (this page is i18n'd), so resolve the
  // MessageId labels through t in a memo — same shape as ClustersPage.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('inventory', columns)
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))
  // Header sorting: Name ascending is the baseline (what the old fixed sort
  // rendered); clicking any sortable header re-orders the filtered rows
  // before paging. Insertion order (VMs then templates) is the tiebreak.
  const { sort, thSort } = useColumnSort({ key: 'name', direction: 'asc' })

  const all = tags.data ?? []
  const entities = [...(vms.data ?? []), ...(templates.data ?? [])]

  const rows: VmListRow[] = [
    ...(vms.data ?? []).map((vm): VmListRow => ({ kind: 'vm', vm })),
    ...(templates.data ?? []).map((template): VmListRow => ({ kind: 'template', template })),
  ]

  // Folder subtree filter (same semantics as VmsPage) composed with the name
  // filter; both are synchronous derivations over the followed tags.
  const folderIds = selectedFolderId === null ? null : folderSubtreeIds(all, selectedFolderId)
  const needle = filter.trim().toLowerCase()
  const visible = rows.filter((row) => {
    const entity = rowEntity(row)
    if (folderIds !== null) {
      const entityTags = followedTagsOf(entity) ?? []
      if (!entityTags.some((tag) => folderIds.has(tag.id))) return false
    }
    return needle === '' || entity.name.toLowerCase().includes(needle)
  })

  // The table gates on the VM collection alone: template rows merge in when
  // their (usually faster) query lands, so a slow /templates read never holds
  // the VM rows back. A failed templates read degrades to a VM-only table
  // with an inline notice (below) instead of blanking the whole view.
  const isPending = vms.isPending
  const isError = vms.isError
  const error = vms.error
  const isFiltering = selectedFolderId !== null && tags.isPending

  // id-keyed joins for the Host/Cluster/DC cells AND the matching sortValue
  // extractors, so sorting by a joined column follows what the cells show
  const hostsById = new Map((hostsQuery.data ?? []).map((host) => [host.id, host.name]))
  const clustersById = new Map((clustersQuery.data ?? []).map((c) => [c.id, c]))
  const dcsById = new Map((dataCentersQuery.data ?? []).map((dc) => [dc.id, dc.name]))
  const ctx: VmListCtx = {
    hostName: (id) => (id !== undefined ? hostsById.get(id) : undefined),
    clusterName: (id) => (id !== undefined ? clustersById.get(id)?.name : undefined),
    dataCenter: (clusterId) => {
      const dcId =
        clusterId !== undefined ? clustersById.get(clusterId)?.data_center?.id : undefined
      const name = dcId !== undefined ? dcsById.get(dcId) : undefined
      return dcId !== undefined && name !== undefined ? { id: dcId, name } : undefined
    },
  }

  // a new filter or folder selection starts back at page 1
  const [prevFilter, setPrevFilter] = useState(filter)
  if (filter !== prevFilter) {
    setPrevFilter(filter)
    setPage(1)
  }
  const [prevFolder, setPrevFolder] = useState(selectedFolderId)
  if (selectedFolderId !== prevFolder) {
    setPrevFolder(selectedFolderId)
    setPage(1)
  }
  const [prevSort, setPrevSort] = useState(sort)
  if (sort !== prevSort) {
    setPrevSort(sort)
    setPage(1)
  }

  const sorted = sortRows(visible, sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row, ctx),
  )

  // Selection pruned to rows that survived filters/polls — the drag payload,
  // toolbar count and Clear all speak this live subset, so stale keys from a
  // narrowed filter can never drag invisible rows.
  const selectedRows =
    selectedKeys.size > 0 ? sorted.filter((row) => selectedKeys.has(rowKeyOf(row))) : []
  const selectedVmIds = selectedRows
    .filter((row) => row.kind === 'vm')
    .map((row) => rowEntity(row).id)
  const selectedTemplateIds = selectedRows
    .filter((row) => row.kind === 'template')
    .map((row) => rowEntity(row).id)

  // "Add tag" from a selected row's menu applies to every selected VM
  const selectedVms = selectedRows
    .filter((row): row is { kind: 'vm'; vm: Vm } => row.kind === 'vm')
    .map((row) => row.vm)
  const tagTargetsFor = (vm: Vm) =>
    selectedVms.length > 1 && selectedKeys.has(`vm-${vm.id}`) ? selectedVms : undefined

  const clearSelection = () => {
    setSelectedKeys(new Set())
    setAnchorKey(null)
  }

  const handleRowClick = (event: ReactMouseEvent<HTMLTableRowElement>, row: VmListRow) => {
    if (!isAdmin || isInteractiveTarget(event.target)) return
    const key = rowKeyOf(row)
    if (event.shiftKey && anchorKey !== null) {
      const keys = sorted.map(rowKeyOf)
      const from = keys.indexOf(anchorKey)
      const to = keys.indexOf(key)
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        const range = keys.slice(lo, hi + 1)
        // bare shift replaces the selection with the range; ctrl+shift adds
        setSelectedKeys((current) =>
          event.ctrlKey || event.metaKey ? new Set([...current, ...range]) : new Set(range),
        )
        return
      }
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedKeys((current) => {
        const next = new Set(current)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      setAnchorKey(key)
      return
    }
    setSelectedKeys(new Set([key]))
    setAnchorKey(key)
  }

  // Grabbing a selected row drags the whole selection; grabbing an
  // unselected row drags just that row (webadmin semantics).
  const dragForRow = (row: VmListRow) => {
    if (selectedRows.length > 1 && selectedKeys.has(rowKeyOf(row)))
      return mixedDragPropsFor(selectedVmIds, selectedTemplateIds)
    return row.kind === 'vm'
      ? mixedDragPropsFor([row.vm.id], [])
      : mixedDragPropsFor([], [row.template.id])
  }

  // Every filtered row × every visible sortable column (sortValue doubles as
  // the machine-readable export value); see lib/csv.ts for the quoting and
  // formula-injection posture.
  const exportCsv = () => {
    const exportColumns = visibleColumns.filter((column) => column.sortValue !== undefined)
    downloadCsv(
      `vms-templates-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        exportColumns.map((column) => column.label),
        sorted.map((row) => exportColumns.map((column) => column.sortValue?.(row, ctx))),
      ),
    )
  }

  // clamp rather than effect-reset — polls can shrink the list underneath
  const lastPage = Math.max(1, Math.ceil(sorted.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = sorted.slice((currentPage - 1) * perPage, currentPage * perPage)

  const folderPath = selectedFolderId === null ? [] : folderPathOf(all, selectedFolderId)
  // The selected folder (last crumb) plus the counts the table actually shows,
  // split by kind, for the compact header block above the table.
  const selectedFolder = folderPath.length > 0 ? folderPath[folderPath.length - 1] : undefined
  const visibleVmCount = visible.filter((row) => row.kind === 'vm').length
  const visibleTemplateCount = visible.length - visibleVmCount

  const table = (
    <>
      {/* Degraded-templates notice: the VM rows below are intact, only the
          template rows are missing. Retry rides the templates query alone. */}
      {!isPending && !isError && templates.isError && (
        <Alert
          variant="warning"
          isInline
          title={t('templates.error.title')}
          style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
          actionLinks={
            <AlertActionLink onClick={() => void templates.refetch()}>
              <FormattedMessage id="action.retry" />
            </AlertActionLink>
          }
        />
      )}

      {(isPending || isFiltering) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('inventory.loading')} />
        </>
      )}

      {isError && (
        <EmptyState titleText={t('inventory.error.title')} status="danger">
          <EmptyStateBody>
            {error instanceof Error ? error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button
            variant="primary"
            onClick={() => {
              void vms.refetch()
              void templates.refetch()
            }}
          >
            <FormattedMessage id="action.retry" />
          </Button>
        </EmptyState>
      )}

      {!isPending && !isError && !isFiltering && visible.length === 0 && needle !== '' && (
        <EmptyState titleText={t('inventory.searchEmpty.title')}>
          <EmptyStateBody>
            <code>{filter}</code>
            {selectedFolderId !== null && <FormattedMessage id="folders.searchEmpty.suffix" />}
          </EmptyStateBody>
          <Button variant="link" onClick={() => setFilter('')}>
            <FormattedMessage id="inventory.searchEmpty.clear" />
          </Button>
        </EmptyState>
      )}

      {!isPending && !isError && !isFiltering && visible.length === 0 && needle === '' && (
        <EmptyState
          titleText={
            selectedFolderId !== null
              ? t('inventory.emptyFolder.title')
              : t('inventory.empty.title')
          }
        >
          <EmptyStateBody>
            {selectedFolderId !== null ? (
              <FormattedMessage id="inventory.emptyFolder.body" />
            ) : (
              <FormattedMessage id="inventory.empty.body" />
            )}
          </EmptyStateBody>
          {selectedFolderId !== null && (
            <Button variant="link" onClick={() => setSelectedFolderId(null)}>
              <FormattedMessage id="folders.emptyState.clear" />
            </Button>
          )}
        </EmptyState>
      )}

      {!isPending && !isError && !isFiltering && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('inventory.table.ariaLabel')}
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
                    presetWidth={column.width}
                    modifier={column.modifier}
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
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((row) => {
                return (
                  <Tr
                    key={rowKeyOf(row)}
                    isRowSelected={selectedKeys.has(rowKeyOf(row))}
                    onClick={(event) => handleRowClick(event, row)}
                    // shift-click extends the selection — suppress the
                    // browser's native text selection for that gesture only
                    onMouseDown={(event) => {
                      if (event.shiftKey) event.preventDefault()
                    }}
                    onContextMenu={(event) => contextMenu.open(event, row)}
                    // user tier gets no drag sources (read-only tree)
                    {...(isAdmin ? dragForRow(row) : {})}
                  >
                    {visibleColumns.map((column) => (
                      <Td
                        key={column.key}
                        dataLabel={column.label}
                        modifier={column.modifier}
                        title={column.title?.(row)}
                      >
                        {column.cell(row, ctx)}
                      </Td>
                    ))}
                    <Td dataLabel="Actions" isActionCell>
                      {/* One kebab per row: VM rows get the shared VmActionsMenu
                        (Migrate folded in, self-gated to admin + running) and
                        template rows the shared TemplateActionsMenu with Create
                        VM (preseeded) and Move to folder folded in — no separate
                        buttons beside the kebab. Lifecycle/edit items show to
                        every tier; the engine's Filter header enforces
                        server-side. */}
                      {row.kind === 'vm' ? (
                        <VmActionsMenu
                          vm={row.vm}
                          includeMigrate
                          tagTargets={tagTargetsFor(row.vm)}
                        />
                      ) : (
                        <TemplateActionsMenu
                          template={row.template}
                          includeMoveToFolder
                          includeCreateVm
                        />
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Right-click twin of the row kebabs: the same dual-mode menu component
          rendered once at the cursor with exactly the row-kebab props above,
          keyed by token so re-opening (same or another row) remounts fresh. */}
      {menuTarget !== null &&
        (menuTarget.ctx.kind === 'vm' ? (
          <VmActionsMenu
            key={`${menuTarget.ctx.vm.id}-${menuTarget.token}`}
            vm={menuTarget.ctx.vm}
            includeMigrate
            tagTargets={tagTargetsFor(menuTarget.ctx.vm)}
            contextMenu={{ position: menuTarget.position, onClose: contextMenu.close }}
          />
        ) : (
          <TemplateActionsMenu
            key={`${menuTarget.ctx.template.id}-${menuTarget.token}`}
            template={menuTarget.ctx.template}
            includeMoveToFolder
            includeCreateVm
            contextMenu={{ position: menuTarget.position, onClose: contextMenu.close }}
          />
        ))}
    </>
  )

  return (
    <PageSection>
      {/* The header row is just the title now — the view switcher moved to sit
          above the left tree. Every action button lives in the toolbar row
          beside the search box so all controls sit on one line. */}
      <ListPageHeader title={<FormattedMessage id="inventory.title" />} />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* With the tree collapsed the above-tree switcher would vanish, so
              it rides along here beside the hamburger and never disappears. */}
          {!isTreeOpen && (
            <ToolbarItem>
              <InventoryViewSwitcher active="inventory" />
            </ToolbarItem>
          )}
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
              value={filter}
              onChange={setFilter}
              onCommit={() => {}}
              hint={t('inventory.filter.hint')}
              ariaLabel={t('inventory.filter.ariaLabel')}
              trailing={<BookmarkMenu area="inventory" currentQuery={filter} onApply={setFilter} />}
            />
          </ToolbarItem>
          {selectedRows.length > 0 && (
            <>
              <ToolbarItem alignSelf="center">
                <span>{t('bulk.selected', { count: selectedRows.length })}</span>
              </ToolbarItem>
              <ToolbarItem alignSelf="center">
                <Button variant="link" isInline onClick={clearSelection}>
                  {t('bulk.clear')}
                </Button>
              </ToolbarItem>
            </>
          )}
          {/* Same admin-gated Tag/Import entries as VmsPage — this combined
              view is still a VM-inventory surface even though row-level
              lifecycle actions live on the rows. */}
          {isAdmin && (
            <ToolbarGroup>
              <ToolbarItem>
                <TagManagerButton />
              </ToolbarItem>
              <ToolbarItem>
                <ImportVmButton />
              </ToolbarItem>
            </ToolbarGroup>
          )}
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
                titles={{ paginationAriaLabel: t('inventory.pagination.ariaLabel') }}
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

      <Flex
        flexWrap={{ default: 'nowrap' }}
        alignItems={{ default: 'alignItemsStretch' }}
        spaceItems={{ default: 'spaceItemsLg' }}
      >
        {isTreeOpen && (
          <InventoryTreeSidebar>
            {/* The inventory-view tab strip pinned full-width atop the tree.
                20rem matches the Hosts & Clusters panel so the sidebar keeps
                its width when switching views. */}
            <div style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              <InventoryViewSwitcher active="inventory" fill />
            </div>
            <FolderTreePanel
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
              entities={entities}
              rootLabel={t('inventory.tree.allLabel')}
              ariaLabel={t('inventory.tree.ariaLabel')}
            />
          </InventoryTreeSidebar>
        )}
        <FlexItem grow={{ default: 'grow' }} style={{ minWidth: 0 }}>
          {folderPath.length > 0 && (
            <Breadcrumb
              aria-label={t('folders.breadcrumb.ariaLabel')}
              style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
            >
              <BreadcrumbItem component="button" onClick={() => setSelectedFolderId(null)}>
                <FormattedMessage id="inventory.tree.allLabel" />
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
          {/* Compact two-line header echoing the infra tree panes: folder icon
              + name, then a muted meta line with the visible VM/template
              counts. No divider — the toolbar already sits directly above. */}
          {selectedFolder !== undefined && (
            <div style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                <FlexItem>
                  <FolderIcon />
                </FlexItem>
                <FlexItem>
                  <Title headingLevel="h2" size="lg">
                    {selectedFolder.name}
                  </Title>
                </FlexItem>
              </Flex>
              <Content component="small">
                {t('inventory.folder.kind')} {t('infra.host.metaSeparator')}{' '}
                {t('inventory.folder.vms', { count: visibleVmCount })}{' '}
                {t('infra.host.metaSeparator')}{' '}
                {t('inventory.folder.templates', { count: visibleTemplateCount })}
              </Content>
            </div>
          )}
          {table}
        </FlexItem>
      </Flex>
    </PageSection>
  )
}
