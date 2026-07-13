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
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Host } from '../api/schemas/host'
import { useCapabilities } from '../auth/capabilities'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { useClustersInventory, useDataCenters } from '../hooks/useAdminResources'
import { HostActionsMenu } from '../components/host-actions/HostActionsMenu'
import { HostedEngineCrown } from '../components/HostedEngineCrown'
import { HostStatusCell, UsageBar, VmCountCell } from '../components/HostListCells'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { BookmarkMenu } from '../components/list-toolbar/BookmarkMenu'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { NewHostModal } from '../components/host-form/NewHostModal'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useHostsUsage } from '../hooks/useHosts'
import { useListSearch } from '../hooks/useListSearch'
import { formatBytes, hostSpmText } from '../lib/format'
import { hostGauges, hostNetworkPercent } from '../lib/utilization'

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

// The status / usage-bar / VM-count cells are shared with the Hosts &
// Clusters cluster pane via components/HostListCells.

// Cluster/DC names come from client-side joins (bare /hosts returns them as
// id-only links; a list-wide ?follow= is avoided per the live-engine quirk).
interface HostColumnCtx {
  clusterName: (id: string | undefined) => string | undefined
  dataCenter: (clusterId: string | undefined) => { id: string; name: string } | undefined
  t: ReturnType<typeof useT>
}

interface HostColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort: extract the comparable value (see hooks/useColumnSort)
  sortValue?: (host: Host, ctx: HostColumnCtx) => string | number | undefined
  cell: (host: Host, ctx: HostColumnCtx) => ReactNode
}

// All visible by default, trimmed via the picker. Headers and cells both map
// over the same isVisible-filtered array so they can never desync. The
// actions kebab column stays out of the picker and renders unconditionally.
const COLUMNS: HostColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (host) => host.name,
    always: true,
    cell: (host) => (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--pf-t--global--spacer--sm)',
        }}
      >
        {/* crown leads the name so the HE markers align down the column */}
        <HostedEngineCrown hostedEngine={host.hosted_engine} hostId={host.id} />
        <Link to="/hosts/$hostId" params={{ hostId: host.id }}>
          {host.name}
        </Link>
      </span>
    ),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (host) => host.comment || undefined,
    defaultHidden: true,
    cell: (host) => host.comment || '—',
  },
  {
    key: 'address',
    labelId: 'hosts.column.address',
    sortValue: (host) => host.address,
    cell: (host) => host.address ?? '—',
  },
  {
    key: 'cluster',
    labelId: 'hosts.column.cluster',
    sortValue: (host, ctx) => ctx.clusterName(host.cluster?.id),
    // linked to the cluster detail page; falls back to plain text (or the em
    // dash) while the clusters inventory join hasn't resolved a name yet
    cell: (host, ctx) => {
      const name = ctx.clusterName(host.cluster?.id)
      if (host.cluster?.id === undefined || name === undefined) return name ?? '—'
      return (
        <Link to="/clusters/$clusterId" params={{ clusterId: host.cluster.id }}>
          {name}
        </Link>
      )
    },
  },
  {
    key: 'datacenter',
    labelId: 'hosts.column.datacenter',
    sortValue: (host, ctx) => ctx.dataCenter(host.cluster?.id)?.name,
    defaultHidden: true,
    // linked to the data center detail page; em dash while the cluster→DC
    // join hasn't resolved yet — same convention as the cluster cell above
    cell: (host, ctx) => {
      const dc = ctx.dataCenter(host.cluster?.id)
      if (dc === undefined) return '—'
      return (
        <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dc.id }}>
          {dc.name}
        </Link>
      )
    },
  },
  {
    key: 'status',
    labelId: 'common.field.status',
    sortValue: (host) => host.status,
    cell: (host, ctx) => (
      <HostStatusCell host={host} updateLabel={ctx.t('host.upgrade.available')} />
    ),
  },
  {
    key: 'vms',
    labelId: 'hosts.column.vms',
    sortValue: (host) => host.summary?.total,
    cell: (host) => <VmCountCell summary={host.summary} />,
  },
  {
    key: 'memory',
    labelId: 'hosts.column.memory',
    sortValue: (host) => {
      const { memoryUsed, memoryTotal } = hostGauges(host)
      return memoryUsed !== undefined && memoryTotal ? (memoryUsed / memoryTotal) * 100 : undefined
    },
    cell: (host, ctx) => {
      const { memoryUsed, memoryTotal } = hostGauges(host)
      if (memoryUsed === undefined || !memoryTotal) return '—'
      return (
        <UsageBar
          percent={(memoryUsed / memoryTotal) * 100}
          label={ctx.t('hosts.memory.measure', {
            used: formatBytes(memoryUsed),
            total: formatBytes(memoryTotal),
          })}
          ariaLabel={ctx.t('hosts.usage.memory', { name: host.name })}
        />
      )
    },
  },
  {
    key: 'cpu',
    labelId: 'hosts.column.cpu',
    sortValue: (host) => hostGauges(host).cpuUsedPercent,
    cell: (host, ctx) => {
      const { cpuUsedPercent } = hostGauges(host)
      if (cpuUsedPercent === undefined) return '—'
      return (
        <UsageBar
          percent={cpuUsedPercent}
          ariaLabel={ctx.t('hosts.usage.cpu', { name: host.name })}
        />
      )
    },
  },
  {
    key: 'network',
    labelId: 'hosts.column.network',
    sortValue: (host) => hostNetworkPercent(host),
    cell: (host, ctx) => {
      const percent = hostNetworkPercent(host)
      if (percent === undefined) return '—'
      return (
        <UsageBar percent={percent} ariaLabel={ctx.t('hosts.usage.network', { name: host.name })} />
      )
    },
  },
  {
    key: 'spm',
    labelId: 'hosts.column.spm',
    sortValue: (host) => hostSpmText(host.spm),
    cell: (host) => hostSpmText(host.spm),
  },
  {
    key: 'os',
    labelId: 'hosts.column.os',
    sortValue: (host) => host.os?.version?.full_version ?? host.version?.full_version,
    defaultHidden: true,
    cell: (host) => host.os?.version?.full_version ?? host.version?.full_version ?? '—',
  },
]

export function HostsPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const hosts = useHostsUsage(query)
  // id → name joins for the Cluster / Data Center columns (already cached
  // app-wide; bare /hosts carries clusters as id-only links)
  const clusters = useClustersInventory()
  const dataCenters = useDataCenters()
  const columnCtx: HostColumnCtx = {
    clusterName: (id) => clusters.data?.find((c) => c.id === id)?.name,
    dataCenter: (clusterId) => {
      const cluster = clusters.data?.find((c) => c.id === clusterId)
      const dc = dataCenters.data?.find((candidate) => candidate.id === cluster?.data_center?.id)
      return dc !== undefined && dc.name !== undefined ? { id: dc.id, name: dc.name } : undefined
    },
    t,
  }
  // Resolve column labels for the active locale; identity is stable per locale.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('hosts', columns)
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  // Header sorting: no default — the engine's search-DSL order (or SORTBY in
  // the query) stands until a header is clicked. A sort change re-orders the
  // whole list, so it starts back at page 1.
  const { sort, thSort } = useColumnSort()
  const [prevSort, setPrevSort] = useState(sort)
  if (sort !== prevSort) {
    setPrevSort(sort)
    setPage(1)
  }

  const visible = sortRows(hosts.data ?? [], sort, (host, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(host, columnCtx),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = visible.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  // The nav already hides Hosts from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads the
  // hosts query is disabled (isPending), so the skeletons cover that gap.
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('hosts.title')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      <ListPageHeader
        title={t('hosts.title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('hosts.new')}
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
              hint={t('hosts.search.hint')}
              ariaLabel={t('hosts.search.ariaLabel')}
              trailing={<BookmarkMenu area="hosts" currentQuery={query} onApply={apply} />}
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
                titles={{ paginationAriaLabel: t('hosts.pagination.ariaLabel') }}
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

      {/* Mounted conditionally (unlike StorageDomainsPage's always-mounted
          modal) on purpose: the New Host draft holds a root password, and
          unmounting on close drops it instead of retaining it behind a
          hidden modal — it also keeps the clusters query from running until
          the dialog actually opens. */}
      {creating && <NewHostModal isOpen onClose={() => setCreating(false)} />}

      {hosts.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('hosts.loading')} />
        </>
      )}

      {hosts.isError && (
        <EmptyState titleText={t('hosts.error.title')} status="danger">
          <EmptyStateBody>
            {hosts.error instanceof Error ? hosts.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void hosts.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {hosts.isSuccess && visible.length === 0 && (
        <EmptyState
          titleText={query !== '' ? t('hosts.emptyFiltered.title') : t('hosts.empty.title')}
        >
          <EmptyStateBody>
            {query !== '' ? t('hosts.emptyFiltered.body') : t('hosts.empty.body')}
          </EmptyStateBody>
          {query !== '' && (
            <Button variant="link" onClick={() => apply('')}>
              {t('common.action.clearSearch')}
            </Button>
          )}
        </EmptyState>
      )}

      {hosts.isSuccess && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('hosts.table.ariaLabel')}
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
              {paged.map((host) => (
                <Tr key={host.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(host, columnCtx)}
                    </Td>
                  ))}
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <HostActionsMenu host={host} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </PageSection>
  )
}
