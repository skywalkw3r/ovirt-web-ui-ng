import { useMemo, useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  ToolbarItem,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Host } from '../../api/schemas/host'
import { useDataCenters } from '../../hooks/useAdminResources'
import { useClusterHosts } from '../../hooks/useClusterDetail'
import type { ColumnSort } from '../../hooks/useColumnSort'
import { useHostsUsage } from '../../hooks/useHosts'
import { useT } from '../../i18n/useT'
import { InfraGrid } from '../../pages/hosts-clusters/InfraGrid'
import {
  INFRA_HOST_COLUMNS,
  type InfraHostColumnCtx,
} from '../../pages/hosts-clusters/infraColumns'
import {
  exportPaneCsv,
  paneTablePagination,
  usePaneTable,
} from '../../pages/hosts-clusters/usePaneTable'
import { HostActionsMenu } from '../host-actions/HostActionsMenu'
import { PaneToolbar } from '../list-toolbar/PaneToolbar'
import { SearchInput } from '../list-toolbar/SearchInput'
import { paneRowMatches } from './paneSearch'

const NAME_ASC: ColumnSort = { key: 'name', direction: 'asc' }

// The hosts belonging to this cluster, on the Hosts & Clusters cluster pane's
// catalog (INFRA_HOST_COLUMNS: webadmin's hosts grid re-defaulted for cluster
// scope — usage gauges on, the locating Cluster / Data Center joins opt-in),
// with its own persisted picker/width area. Hosts have no engine-search entry
// point here, so useClusterHosts filters the global /hosts read on the
// cluster back-link. The usage read (statistics, the heaviest host query) is
// the same cached one the Hosts page polls; it only runs while this tab is
// mounted, and its rows replace the cheap ones as they land, so identity and
// status render at once and the gauges fill in.
export function ClusterHostsTab({
  clusterId,
  clusterName,
  dataCenterId,
}: {
  clusterId: string
  clusterName: string | undefined
  dataCenterId: string | undefined
}) {
  const t = useT()
  const hosts = useClusterHosts(clusterId)
  const usage = useHostsUsage('')
  const dataCenters = useDataCenters()
  const [search, setSearch] = useState('')

  const ctx: InfraHostColumnCtx = useMemo(() => {
    const dc = (dataCenters.data ?? []).find((candidate) => candidate.id === dataCenterId)
    return {
      clusterName: (id) => (id === clusterId ? clusterName : undefined),
      dataCenter: (id) =>
        id === clusterId && dc?.name !== undefined ? { id: dc.id, name: dc.name } : undefined,
      t,
    }
  }, [dataCenters.data, dataCenterId, clusterId, clusterName, t])

  const rows: Host[] = useMemo(() => {
    const usageById = new Map((usage.data ?? []).map((host) => [host.id, host]))
    return (hosts.data ?? []).map((host) => usageById.get(host.id) ?? host)
  }, [hosts.data, usage.data])
  const matching = useMemo(
    () => rows.filter((host) => paneRowMatches(host, INFRA_HOST_COLUMNS, ctx, search)),
    [rows, ctx, search],
  )
  const table = usePaneTable({
    area: 'cluster-hosts',
    catalog: INFRA_HOST_COLUMNS,
    rows: matching,
    ctx,
    defaultSort: NAME_ASC,
  })

  const toolbar = (
    <PaneToolbar
      filters={
        <ToolbarItem style={{ width: '18rem' }}>
          <SearchInput
            value={search}
            onChange={(next) => {
              setSearch(next)
              table.paging.setPage(1)
            }}
            // filters rows already in memory; nothing left to publish on Enter
            onCommit={() => {}}
            ariaLabel={t('hosts.search.ariaLabel')}
          />
        </ToolbarItem>
      }
      pagination={paneTablePagination(table, 'infra.hosts.pagination.ariaLabel')}
      onExportCsv={() => exportPaneCsv('cluster-hosts', table)}
      columns={table.columns}
      prefs={table.prefs}
    />
  )

  if (hosts.isPending) {
    return (
      <>
        {toolbar}
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('hosts.loading')} />
      </>
    )
  }

  if (hosts.isError) {
    return (
      <>
        {toolbar}
        <EmptyState titleText={t('clusterHosts.error.title')} status="danger">
          <EmptyStateBody>
            {hosts.error instanceof Error ? hosts.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void hosts.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <>
        {toolbar}
        <EmptyState titleText={t('hosts.empty.title')}>
          <EmptyStateBody>{t('clusterHosts.empty.body')}</EmptyStateBody>
        </EmptyState>
      </>
    )
  }

  if (matching.length === 0) {
    return (
      <>
        {toolbar}
        <EmptyState titleText={t('common.state.searchEmpty.title')}>
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

  return (
    <>
      {toolbar}
      <InfraGrid
        ariaLabel={t('clusterHosts.table.ariaLabel')}
        table={table}
        rowKey={(host) => host.id}
        rowActions={(host) => <HostActionsMenu host={host} />}
      />
    </>
  )
}
