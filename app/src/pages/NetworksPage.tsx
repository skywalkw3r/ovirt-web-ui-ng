import { useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
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
import { FormattedMessage } from 'react-intl'
import type { Network } from '../api/schemas/network'
import { useT } from '../i18n/useT'
import type { MessageId } from '../i18n/messages/en'
import { ListPageHeader } from '../components/ListPageHeader'
import { NetworkFormModal } from '../components/network-form/NetworkFormModal'
import { ImportExternalNetworksModal } from '../components/network-import/ImportExternalNetworksModal'
import { RefreshControl } from '../components/RefreshControl'
import { ColumnPicker } from '../components/list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../components/list-toolbar/ResizableTh'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useDataCenters } from '../hooks/useAdminResources'
import { useColumnPrefs } from '../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useListSearch } from '../hooks/useListSearch'
import { useNetworks } from '../hooks/useNetworks'
import { useProviders } from '../hooks/useParityResources'
import { statusText } from '../lib/format'

// Cluster-scoped roles (management/display/migration/gluster/default_route)
// only ride on /clusters/{id}/networks reads — the flat /networks list maps
// usages from the network entity alone, so 'vm' is the only role it carries
// (restapi NetworkMapper sets the cluster roles only when entity.getCluster()
// is non-null). Webadmin's main-grid Role column makes the same call and only
// distinguishes VM from non-VM networks; the map still covers every
// NetworkUsage value so a cluster-scoped payload would render correctly.
const ROLE_LABEL_IDS: Record<string, MessageId> = {
  vm: 'networks.role.vm',
  management: 'networks.role.management',
  display: 'networks.role.display',
  migration: 'networks.role.migration',
  gluster: 'networks.role.gluster',
  default_route: 'networks.role.defaultRoute',
}

function RoleBadges({ usages }: { usages: Network['usages'] }) {
  const t = useT()
  const roles = usages?.usage ?? []
  if (roles.length === 0) return <>—</>
  return (
    <LabelGroup aria-label={t('networks.roles.ariaLabel')}>
      {roles.map((role) => (
        <Label key={role} isCompact>
          {ROLE_LABEL_IDS[role] ? t(ROLE_LABEL_IDS[role]) : statusText(role)}
        </Label>
      ))}
    </LabelGroup>
  )
}

// Data center / provider names come from client-side joins — the flat
// /networks list carries both as id-only links, and a list-wide ?follow= is
// avoided per the live-engine 500 quirk. Both inventory hooks are admin-gated
// upstream; user-tier sessions render em dashes in those cells.
interface NetworkColumnCtx {
  dataCenterName: (id: string | undefined) => string | undefined
  providerName: (id: string | undefined) => string | undefined
  t: ReturnType<typeof useT>
}

interface NetworkColumn {
  key: string
  labelId: MessageId
  always?: boolean
  defaultHidden?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (network: Network, ctx: NetworkColumnCtx) => string | number | undefined
  cell: (network: Network, ctx: NetworkColumnCtx) => ReactNode
}

// Headers and cells both map over the same isVisible-filtered array so they
// can never desync.
const COLUMNS: NetworkColumn[] = [
  {
    key: 'name',
    labelId: 'common.field.name',
    sortValue: (network) => network.name,
    always: true,
    cell: (network) => (
      <Link to="/networks/$networkId" params={{ networkId: network.id }}>
        {network.name}
      </Link>
    ),
  },
  {
    key: 'comment',
    labelId: 'common.field.comment',
    sortValue: (network) => network.comment || undefined,
    defaultHidden: true,
    cell: (network) => network.comment || '—',
  },
  {
    key: 'datacenter',
    labelId: 'networks.column.datacenter',
    sortValue: (network, ctx) => ctx.dataCenterName(network.data_center?.id),
    cell: (network, ctx) => ctx.dataCenterName(network.data_center?.id) ?? '—',
  },
  {
    key: 'description',
    labelId: 'common.field.description',
    sortValue: (network) => network.description || undefined,
    cell: (network) => network.description || '—',
  },
  {
    key: 'role',
    labelId: 'networks.column.role',
    sortValue: (network) => network.usages?.usage?.slice().sort().join(', ') || undefined,
    cell: (network) => <RoleBadges usages={network.usages} />,
  },
  {
    key: 'vlan',
    labelId: 'networks.column.vlan',
    sortValue: (network) => network.vlan?.id,
    cell: (network, ctx) =>
      network.vlan?.id != null ? (
        <Label isCompact color="blue">
          {ctx.t('networks.vlan', { id: network.vlan.id })}
        </Label>
      ) : (
        '—'
      ),
  },
  {
    key: 'provider',
    labelId: 'networks.column.provider',
    sortValue: (network, ctx) => ctx.providerName(network.external_provider?.id),
    defaultHidden: true,
    cell: (network, ctx) => ctx.providerName(network.external_provider?.id) ?? '—',
  },
  {
    key: 'mtu',
    labelId: 'networks.column.mtu',
    sortValue: (network) => network.mtu,
    // 0 means "use the engine default" — webadmin's MtuRenderer prints
    // "Default (<DefaultMTU config>)"; that config value is not on the flat
    // list, so render the word alone
    cell: (network, ctx) =>
      network.mtu === undefined
        ? '—'
        : network.mtu === 0
          ? ctx.t('networks.mtu.default')
          : network.mtu,
  },
  {
    key: 'port_isolation',
    labelId: 'networks.column.portIsolation',
    sortValue: (network) =>
      network.port_isolation === undefined ? undefined : network.port_isolation ? 1 : 0,
    defaultHidden: true,
    cell: (network, ctx) =>
      network.port_isolation === undefined
        ? '—'
        : network.port_isolation
          ? ctx.t('common.yes')
          : ctx.t('common.no'),
  },
]
// Deferred vs webadmin's grid: QoS Name (the flat list carries qos as a bare
// { id } link; names would need a per-DC /datacenters/{id}/qoss fan-out),
// Label (network labels live in the /networks/{id}/networklabels
// subcollection — an N+1 per row), Status (a cluster-network attribute:
// NetworkMapper only sets it on /clusters/{id}/networks reads, so the flat
// list never carries it).

const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

export function NetworksPage() {
  const t = useT()
  const { query, draft, setDraft, commit, apply } = useListSearch()
  const networks = useNetworks(query)
  // id → name joins for the Data Center / Provider columns (both collections
  // are already cached app-wide at the 60s admin cadence)
  const dataCenters = useDataCenters()
  const providers = useProviders()
  const columnCtx: NetworkColumnCtx = {
    dataCenterName: (id) => dataCenters.data?.find((dc) => dc.id === id)?.name,
    providerName: (id) => providers.data?.find((provider) => provider.id === id)?.name,
    t,
  }
  const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, label: t(c.labelId) })), [t])
  const prefs = useColumnPrefs('networks', columns)
  // client-side header sort; no default — the engine list order stands
  // until a header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // a new committed search starts back at page 1
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setPage(1)
  }

  const visible = sortRows(networks.data ?? [], sort, (row, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(row, columnCtx),
  )

  // clamp rather than effect-reset: polling refetches can shrink the list
  // underneath the current page
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage))
  const currentPage = Math.min(page, lastPage)
  const paged = visible.slice((currentPage - 1) * perPage, currentPage * perPage)

  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))

  return (
    <PageSection>
      <ListPageHeader
        title={t('networks.title')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              {t('network.import.action')}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('networks.new')}
            </Button>
          </>
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
              hint={t('networks.search.hint')}
              ariaLabel={t('networks.search.ariaLabel')}
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
                titles={{ paginationAriaLabel: t('networks.pagination.ariaLabel') }}
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

      <NetworkFormModal isOpen={creating} onClose={() => setCreating(false)} />
      {/* mounted per open so provider/selection state resets between openings */}
      {importing && <ImportExternalNetworksModal isOpen onClose={() => setImporting(false)} />}

      {networks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('networks.loading')} />
        </>
      )}

      {networks.isError && (
        <EmptyState titleText={t('networks.error.title')} status="danger">
          <EmptyStateBody>
            {networks.error instanceof Error ? networks.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void networks.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {networks.isSuccess && visible.length === 0 && (
        <EmptyState
          titleText={query !== '' ? t('networks.searchEmpty.title') : t('networks.empty.title')}
        >
          <EmptyStateBody>
            {query !== '' ? (
              <FormattedMessage
                id="networks.searchEmpty.matches"
                values={{ query: <code>{query}</code> }}
              />
            ) : (
              t('networks.empty.body')
            )}
          </EmptyStateBody>
          {query !== '' && (
            <Button variant="link" onClick={() => apply('')}>
              {t('common.action.clearSearch')}
            </Button>
          )}
        </EmptyState>
      )}

      {networks.isSuccess && visible.length > 0 && (
        <div className="app-table-viewport">
          <Table
            aria-label={t('networks.table.ariaLabel')}
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
              {paged.map((network) => (
                <Tr key={network.id}>
                  {visibleColumns.map((column) => (
                    <Td key={column.key} dataLabel={column.label}>
                      {column.cell(network, columnCtx)}
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
