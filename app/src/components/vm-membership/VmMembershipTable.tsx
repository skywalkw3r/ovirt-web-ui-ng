import { useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Pagination,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { UseQueryResult } from '@tanstack/react-query'
import { FormattedMessage } from 'react-intl'
import type { Vm } from '../../api/schemas/vm'
import type { ColumnPrefs } from '../../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useT } from '../../i18n/useT'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import { SearchInput } from '../list-toolbar/SearchInput'
import type { VmMembershipColumn } from './columns'
import { vmMatchesSearch } from './search'

// Page sizes, the same set every inventory table offers (PaneToolbar).
const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// The five-state shell shared by every "VMs of <parent>" tab (cluster, pool,
// template, quota — pair with useVmMembership): Skeleton, danger EmptyState +
// Retry, EmptyState with per-parent body text, EmptyState + Clear search when
// the filter matches nothing, compact table of VM rows.
//
// Rows are filtered, sorted, then paged entirely client-side — the membership
// list is one already-cached /vms read, so a cluster with thousands of VMs
// narrows and pages without touching the engine. The toolbar carrying those
// controls renders above the table whenever the parent HAS VMs; the loading /
// error / genuinely-empty states keep their bare shell (nothing to filter).
// `toolbarItems` (the quota tab's ColumnPicker) rides in that toolbar's
// end-aligned group, right of the pagination. `resizePrefs` opts a
// useColumnPrefs-backed tab into the drag-resizable-columns rollout: headers
// become ResizableTh and the table rides an .app-table-viewport scroll box
// (the quota tab; the ≤3-column tabs stay fluid).
export function VmMembershipTable({
  query,
  columns,
  ariaLabel,
  emptyBody,
  toolbarItems,
  resizePrefs,
}: {
  query: UseQueryResult<Vm[], Error>
  columns: VmMembershipColumn[]
  ariaLabel: string
  emptyBody: string
  toolbarItems?: ReactNode
  resizePrefs?: ColumnPrefs
}) {
  const t = useT()
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Called before the early returns
  // below so hook order stays stable across the four states.
  const { sort, thSort } = useColumnSort()
  // Filter + paging state is local to the tab: a detail page mounts exactly one
  // VM membership table, and this is a tab-local narrowing rather than the list
  // pages' shareable ?q= query (useListSearch), which publishes to the engine.
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // A column's header/dataLabel text: resolve labelId through t() (the shared
  // Name/Status columns), else the pre-resolved label the caller passed.
  const labelOf = (column: VmMembershipColumn) =>
    column.labelId ? t(column.labelId) : (column.label ?? '')

  if (query.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('vms.loading')} />
      </>
    )
  }

  if (query.isError) {
    return (
      <EmptyState titleText={t('vms.error.title')} status="danger">
        <EmptyStateBody>
          {query.error instanceof Error ? query.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void query.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (query.data.length === 0) {
    return (
      <EmptyState titleText={t('vms.empty.title')}>
        <EmptyStateBody>{emptyBody}</EmptyStateBody>
      </EmptyState>
    )
  }

  const rows = sortRows(
    query.data.filter((vm) => vmMatchesSearch(search, vm, columns)),
    sort,
    (vm, key) => columns.find((column) => column.key === key)?.sortValue?.(vm),
  )
  // Clamp rather than effect-reset: the shared /vms poll refetches underneath
  // this table, so the row count can shrink below the current page at any tick
  // (the list pages' idiom).
  const lastPage = Math.max(1, Math.ceil(rows.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = rows.slice((currentPage - 1) * perPage, currentPage * perPage)

  const toolbar = (
    <Toolbar style={{ paddingBlockStart: 0, paddingBottom: 'var(--pf-t--global--spacer--sm)' }}>
      <ToolbarContent>
        <ToolbarItem style={{ width: '18rem' }}>
          <SearchInput
            value={search}
            onChange={(next) => {
              setSearch(next)
              // a narrowed list re-flows from the top; page 3 of the old
              // result set means nothing in the new one
              setPage(1)
            }}
            // Plain-text filter over rows already in memory: every keystroke
            // has applied by the time the commit gesture (Enter / clear)
            // fires, so there is nothing left to publish — PermissionsPanel's
            // live-filter precedent.
            onCommit={() => {}}
            ariaLabel={t('vms.search.ariaLabel')}
          />
        </ToolbarItem>
        <ToolbarGroup align={{ default: 'alignEnd' }}>
          <ToolbarItem variant="pagination">
            <Pagination
              isCompact
              variant="top"
              itemCount={rows.length}
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
          {toolbarItems}
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  )

  // Rows exist but the filter matched none of them — an empty query passes
  // every row, so landing here implies a non-empty search. The toolbar stays
  // put: the box holding the query is also the way back out of this state.
  if (rows.length === 0) {
    return (
      <>
        {toolbar}
        <EmptyState titleText={t('vms.searchEmpty.title')}>
          <EmptyStateBody>
            <FormattedMessage
              id="vms.searchEmpty.matches"
              values={{ query: <code>{search}</code> }}
            />
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="link" onClick={() => setSearch('')}>
                {t('common.action.clearSearch')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      </>
    )
  }

  const table = (
    <Table
      aria-label={ariaLabel}
      variant="compact"
      {...(resizePrefs ? resizableTableProps(resizePrefs) : {})}
    >
      <Thead>
        <Tr>
          {columns.map((column, index) => {
            const label = labelOf(column)
            const sortProps =
              column.sortValue !== undefined
                ? thSort(
                    columns.map((c) => c.key),
                    index,
                  )
                : undefined
            return resizePrefs ? (
              <ResizableTh
                key={column.key}
                columnKey={column.key}
                label={label}
                prefs={resizePrefs}
                presetWidth={column.width}
                sort={sortProps}
              >
                {label}
              </ResizableTh>
            ) : (
              <Th key={column.key} width={column.width} sort={sortProps}>
                {label}
              </Th>
            )
          })}
        </Tr>
      </Thead>
      <Tbody>
        {paged.map((vm) => (
          <Tr key={vm.id}>
            {columns.map((column) => (
              <Td
                key={column.key}
                dataLabel={labelOf(column)}
                modifier={column.modifier}
                title={column.title?.(vm)}
              >
                {column.render(vm)}
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  )

  return (
    <>
      {toolbar}
      {resizePrefs ? <div className="app-table-viewport">{table}</div> : table}
    </>
  )
}
