import type { MouseEvent as ReactMouseEvent } from 'react'
import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import type { DataCenter } from '../../api/schemas/datacenter'
import { PaneToolbar } from '../../components/list-toolbar/PaneToolbar'
import { useT } from '../../i18n/useT'
import type { Translate } from './infraColumns'
import { InfraGrid } from './InfraGrid'
import { exportPaneCsv, paneTablePagination, type PaneTable } from './usePaneTable'

// The root pane's Data centers grid (area 'infra-datacenters'): its paging,
// export and column picker ride the PaneToolbar above it; the tab strip
// already names the pane, so the grid carries no heading of its own. Clicking
// a row drills the tree into that data center; right-click opens the shared
// DC menu. Read/browse posture — no row kebab.
export function DataCentersPane({
  table,
  onDrill,
  onRowContextMenu,
}: {
  table: PaneTable<DataCenter, Translate>
  onDrill: (dcId: string) => void
  onRowContextMenu: (event: ReactMouseEvent, dc: DataCenter) => void
}) {
  const t = useT()
  return (
    <>
      <PaneToolbar
        pagination={paneTablePagination(table, 'infra.datacenters.pagination.ariaLabel')}
        onExportCsv={() => exportPaneCsv('datacenters', table)}
        columns={table.columns}
        prefs={table.prefs}
      />
      {table.paged.length === 0 ? (
        <EmptyState titleText={t('datacenters.empty.title')}>
          <EmptyStateBody>{t('datacenters.empty.body')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <InfraGrid
          ariaLabel={t('datacenters.table.ariaLabel')}
          table={table}
          rowKey={(dc) => dc.id}
          onRowClick={(dc) => onDrill(dc.id)}
          onRowContextMenu={onRowContextMenu}
        />
      )}
    </>
  )
}
