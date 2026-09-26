import type { MouseEvent as ReactMouseEvent } from 'react'
import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import type { Cluster } from '../../api/schemas/cluster'
import { PaneToolbar } from '../../components/list-toolbar/PaneToolbar'
import { useT } from '../../i18n/useT'
import type { InfraClusterColumnCtx } from './infraColumns'
import { InfraGrid } from './InfraGrid'
import { exportPaneCsv, paneTablePagination, type PaneTable } from './usePaneTable'

// One clusters grid (area 'infra-clusters') serves the DC pane and the root
// Clusters tab. Clicking a row drills the tree into that cluster; right-click
// opens the shared cluster menu. Rows carry no kebab — this inventory pane is
// read/browse only (Edit/Upgrade/Remove live on the detail page).
export function ClustersPane({
  table,
  onDrill,
  onRowContextMenu,
}: {
  table: PaneTable<Cluster, InfraClusterColumnCtx>
  onDrill: (clusterId: string) => void
  onRowContextMenu: (event: ReactMouseEvent, cluster: Cluster) => void
}) {
  const t = useT()
  return (
    <>
      <PaneToolbar
        pagination={paneTablePagination(table, 'infra.clusters.pagination.ariaLabel')}
        onExportCsv={() => exportPaneCsv('clusters', table)}
        columns={table.columns}
        prefs={table.prefs}
      />
      {table.paged.length === 0 ? (
        <EmptyState titleText={t('clusters.empty.title')}>
          <EmptyStateBody>{t('clusters.empty.body')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <InfraGrid
          ariaLabel={t('infra.clusters.ariaLabel')}
          table={table}
          rowKey={(cluster) => cluster.id}
          onRowClick={(cluster) => onDrill(cluster.id)}
          onRowContextMenu={onRowContextMenu}
        />
      )}
    </>
  )
}
