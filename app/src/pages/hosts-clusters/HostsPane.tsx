import { EmptyState, EmptyStateBody } from '@patternfly/react-core'
import type { Host } from '../../api/schemas/host'
import { HostActionsMenu } from '../../components/host-actions/HostActionsMenu'
import { PaneToolbar } from '../../components/list-toolbar/PaneToolbar'
import { useT } from '../../i18n/useT'
import type { InfraHostColumnCtx } from './infraColumns'
import { InfraGrid } from './InfraGrid'
import { exportPaneCsv, paneTablePagination, type PaneTable } from './usePaneTable'

// One hosts grid (area 'infra-hosts') serves the cluster pane and the DC/root
// Hosts tab — header sorts and row kebabs stay identical wherever it shows.
// Its paging, export and column picker ride the PaneToolbar above it; the tab
// strip already names the pane, so the grid carries no heading of its own.
export function HostsPane({ table }: { table: PaneTable<Host, InfraHostColumnCtx> }) {
  const t = useT()
  return (
    <>
      <PaneToolbar
        pagination={paneTablePagination(table, 'infra.hosts.pagination.ariaLabel')}
        onExportCsv={() => exportPaneCsv('hosts', table)}
        columns={table.columns}
        prefs={table.prefs}
      />
      {table.paged.length === 0 ? (
        <EmptyState titleText={t('hosts.empty.title')}>
          <EmptyStateBody>{t('hosts.empty.body')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <InfraGrid
          ariaLabel={t('hosts.table.ariaLabel')}
          table={table}
          rowKey={(host) => host.id}
          rowActions={(host) => <HostActionsMenu host={host} />}
        />
      )}
    </>
  )
}
