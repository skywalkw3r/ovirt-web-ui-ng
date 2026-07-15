import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Pagination,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { DataCenter } from '../api/schemas/datacenter'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { StatusBadge } from '../components/StatusBadge'
import { RefreshControl } from '../components/RefreshControl'
import { DataCenterFormModal } from '../components/datacenter-form/DataCenterFormModal'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useDataCenters } from '../hooks/useAdminResources'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useListSearch } from '../hooks/useListSearch'
import { statusText } from '../lib/format'

// 'up' | 'maintenance' | 'not_operational' | ... — same coloring policy as
// HostsPage: only the two states an admin acts on routinely get a signal.
function StatusCell({ status }: { status?: string }) {
  if (!status) return <>—</>
  const normalized = status.toLowerCase()
  const color = normalized === 'up' ? 'green' : normalized === 'maintenance' ? 'yellow' : 'grey'
  return <StatusBadge color={color}>{statusText(status)}</StatusBadge>
}

// dc.local: the single-host local-storage kind vs the ordinary shared kind
function StorageTypeCell({ dataCenter }: { dataCenter: DataCenter }) {
  const t = useT()
  if (dataCenter.local === undefined) return <>—</>
  return <>{dataCenter.local ? t('datacenters.storageLocal') : t('datacenters.storageShared')}</>
}

interface DataCenterColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (dataCenter: DataCenter) => string | number | undefined
  cell: (dataCenter: DataCenter) => ReactNode
}

// Webadmin's MainDataCenterView grid, minus the Status Icon / Additional
// Status glyph columns — the Status Label already carries that signal.
// Headers and cells both map over the same isVisible-filtered array so they
// can never desync.
const COLUMNS: DataCenterColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (dataCenter) => dataCenter.name,
    always: true,
    cell: (dataCenter) => (
      <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dataCenter.id }}>
        {dataCenter.name}
      </Link>
    ),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (dataCenter) => dataCenter.comment || undefined,
    defaultHidden: true,
    cell: (dataCenter) => dataCenter.comment || '—',
  },
  {
    key: 'storageType',
    labelId: 'datacenters.column.storageType',
    sortValue: (dataCenter) =>
      dataCenter.local === undefined ? undefined : dataCenter.local ? 'local' : 'shared',
    cell: (dataCenter) => <StorageTypeCell dataCenter={dataCenter} />,
  },
  {
    key: 'status',
    labelId: 'common.field.status',
    cell: (dataCenter) => <StatusCell status={dataCenter.status} />,
  },
  {
    key: 'compatVersion',
    labelId: 'common.field.compatVersion',
    sortValue: (dataCenter) =>
      dataCenter.version?.major !== undefined
        ? `${dataCenter.version.major}.${dataCenter.version.minor ?? 0}`
        : undefined,
    defaultHidden: true,
    cell: (dataCenter) => {
      const { major, minor } = dataCenter.version ?? {}
      if (major === undefined) return '—'
      return minor === undefined ? `${major}` : `${major}.${minor}`
    },
  },
  {
    key: 'storageFormat',
    labelId: 'datacenters.column.storageFormat',
    sortValue: (dataCenter) => dataCenter.storage_format,
    defaultHidden: true,
    cell: (dataCenter) => dataCenter.storage_format ?? '—',
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (dataCenter) => dataCenter.description || undefined,
    cell: (dataCenter) => dataCenter.description || '—',
  },
]

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

export function DataCentersPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const dataCenters = useDataCenters(query)
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('datacenters', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  const visible = sortRows(dataCenters.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = visible.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  // The nav already hides Data centers from user-tier accounts; this covers
  // deep links typed straight into the address bar. Before the profile loads
  // the query is disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('datacenters.title')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader
        title={t('datacenters.title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('datacenters.new')}
          </Button>
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          {/* wide enough to keep the DSL example placeholder readable */}
          <ToolbarItem style={{ width: '22rem' }}>
            <SearchInput
              value={draft}
              onChange={setDraft}
              onCommit={commit}
              hint={t('datacenters.search.hint')}
              ariaLabel={t('datacenters.search.ariaLabel')}
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
                titles={{ paginationAriaLabel: t('datacenters.pagination.ariaLabel') }}
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

      <DataCenterFormModal isOpen={creating} onClose={() => setCreating(false)} />

      {dataCenters.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('datacenters.loading')} />
        </>
      )}

      {dataCenters.isError && (
        <EmptyState titleText={t('datacenters.error.title')} status="danger">
          <EmptyStateBody>
            {dataCenters.error instanceof Error
              ? dataCenters.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void dataCenters.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {dataCenters.isSuccess && visible.length === 0 && (
        <EmptyState
          titleText={
            query !== '' ? t('datacenters.emptyFiltered.title') : t('datacenters.empty.title')
          }
        >
          <EmptyStateBody>
            {query !== '' ? t('datacenters.emptyFiltered.body') : t('datacenters.empty.body')}
          </EmptyStateBody>
          {query !== '' && (
            <Button variant="link" onClick={() => apply('')}>
              {t('common.action.clearSearch')}
            </Button>
          )}
        </EmptyState>
      )}

      {dataCenters.isSuccess && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('datacenters.table.ariaLabel')}
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
              </Tr>
            </Thead>
            <Tbody>
              {paged.map((dataCenter) => (
                <Tr key={dataCenter.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(dataCenter)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </PageSection>
  )
}
