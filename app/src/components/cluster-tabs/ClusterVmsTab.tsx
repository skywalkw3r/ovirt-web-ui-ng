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
import { useDataCenters } from '../../hooks/useAdminResources'
import { useClusterHosts } from '../../hooks/useClusterDetail'
import type { ColumnSort } from '../../hooks/useColumnSort'
import { useVmMembership } from '../../hooks/useVmMembership'
import { useT } from '../../i18n/useT'
import { InfraGrid } from '../../pages/hosts-clusters/InfraGrid'
import {
  exportPaneCsv,
  paneTablePagination,
  usePaneTable,
} from '../../pages/hosts-clusters/usePaneTable'
import { PaneToolbar } from '../list-toolbar/PaneToolbar'
import { SearchInput } from '../list-toolbar/SearchInput'
import { VmActionsMenu } from '../VmActionsMenu'
import {
  VM_LIST_COLUMNS,
  type VmListColumn,
  type VmListCtx,
  type VmListRow,
} from '../vmListColumns'
import { paneRowMatches } from './paneSearch'

type ClusterVmRow = Extract<VmListRow, { kind: 'vm' }>

// The shared VM-list catalog — the same picker set, order and cells as the
// VMs & Templates and Hosts & Clusters grids — re-defaulted for cluster scope:
// Cluster and Data Center name the page the user is already on, so they start
// hidden (still pickable). Visibility and widths persist under their own area.
const CLUSTER_VM_COLUMNS: VmListColumn[] = VM_LIST_COLUMNS.map((column) =>
  column.key === 'cluster' || column.key === 'datacenter'
    ? { ...column, defaultHidden: true }
    : column,
)

const NAME_ASC: ColumnSort = { key: 'name', direction: 'asc' }

// The VMs in this cluster. useVmMembership client-filters the shared /vms feed
// on each VM's cluster link, so this grid costs no extra engine read; the host
// names join against the cluster's own hosts (a VM in this cluster runs on one
// of them) and the data center against the cached inventory.
export function ClusterVmsTab({
  clusterId,
  clusterName,
  dataCenterId,
}: {
  clusterId: string
  clusterName: string | undefined
  dataCenterId: string | undefined
}) {
  const t = useT()
  const vms = useVmMembership('cluster', clusterId, (vm) => vm.cluster?.id === clusterId)
  const hosts = useClusterHosts(clusterId)
  const dataCenters = useDataCenters()
  const [search, setSearch] = useState('')

  const ctx: VmListCtx = useMemo(() => {
    const hostNames = new Map((hosts.data ?? []).map((host) => [host.id, host.name]))
    const dc = (dataCenters.data ?? []).find((candidate) => candidate.id === dataCenterId)
    return {
      hostName: (id) => (id !== undefined ? hostNames.get(id) : undefined),
      clusterName: (id) => (id === clusterId ? clusterName : undefined),
      dataCenter: (id) =>
        id === clusterId && dc?.name !== undefined ? { id: dc.id, name: dc.name } : undefined,
    }
  }, [hosts.data, dataCenters.data, dataCenterId, clusterId, clusterName])

  const rows = useMemo(
    () => (vms.data ?? []).map((vm): ClusterVmRow => ({ kind: 'vm', vm })),
    [vms.data],
  )
  const matching = useMemo(
    () => rows.filter((row) => paneRowMatches(row, CLUSTER_VM_COLUMNS, ctx, search)),
    [rows, ctx, search],
  )
  const table = usePaneTable<ClusterVmRow, VmListCtx>({
    area: 'cluster-vms',
    catalog: CLUSTER_VM_COLUMNS,
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
            // filters rows already in memory, so every keystroke has applied
            // by the time Enter / clear fires — nothing left to publish
            onCommit={() => {}}
            ariaLabel={t('vms.search.ariaLabel')}
          />
        </ToolbarItem>
      }
      pagination={paneTablePagination(table, 'infra.vms.pagination.ariaLabel')}
      onExportCsv={() => exportPaneCsv('cluster-vms', table)}
      columns={table.columns}
      prefs={table.prefs}
    />
  )

  if (vms.isPending) {
    return (
      <>
        {toolbar}
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('vms.loading')} />
      </>
    )
  }

  if (vms.isError) {
    return (
      <>
        {toolbar}
        <EmptyState titleText={t('vms.error.title')} status="danger">
          <EmptyStateBody>
            {vms.error instanceof Error ? vms.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void vms.refetch()}>
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
        <EmptyState titleText={t('vms.empty.title')}>
          <EmptyStateBody>{t('clusterVms.empty.body')}</EmptyStateBody>
        </EmptyState>
      </>
    )
  }

  // rows exist but the search matched none — the box holding the query stays
  // put above, and Clear search is the way back out
  if (matching.length === 0) {
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

  return (
    <>
      {toolbar}
      <InfraGrid
        ariaLabel={t('clusterVms.table.ariaLabel')}
        table={table}
        rowKey={(row) => row.vm.id}
        rowActions={(row) => <VmActionsMenu vm={row.vm} includeMigrate />}
      />
    </>
  )
}
