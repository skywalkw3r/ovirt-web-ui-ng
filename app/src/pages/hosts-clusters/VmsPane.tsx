import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Vm } from '../../api/schemas/vm'
import { PaneToolbar } from '../../components/list-toolbar/PaneToolbar'
import { VmActionsMenu } from '../../components/VmActionsMenu'
import type { VmListCtx } from '../../components/vmListColumns'
import type { useVms } from '../../hooks/useVms'
import { useT } from '../../i18n/useT'
import { InfraGrid } from './InfraGrid'
import type { VmPaneRow } from './useInfraInventory'
import { exportPaneCsv, paneTablePagination, type PaneTable } from './usePaneTable'

// The scoped-VM pane (area 'infra-vms'), shared by every selection layer. It
// owns its own four states: the tree renders from the cheap inventory reads,
// so a slow (or failed) VM collection only ever blanks this table, never the
// whole view. Its PaneToolbar sits above all four states so the chrome holds
// its place while the rows load. Rows are always VMs; they ride the shared
// VM-list catalog (vmListColumns) in the { kind: 'vm' } row shape.
export function VmsPane({
  vmsQuery,
  table,
  onRowContextMenu,
}: {
  vmsQuery: ReturnType<typeof useVms>
  table: PaneTable<VmPaneRow, VmListCtx>
  onRowContextMenu: (event: ReactMouseEvent, vm: Vm) => void
}) {
  const t = useT()
  return (
    <>
      <PaneToolbar
        pagination={paneTablePagination(table, 'infra.vms.pagination.ariaLabel')}
        onExportCsv={() => exportPaneCsv('vms', table)}
        columns={table.columns}
        prefs={table.prefs}
      />

      {vmsQuery.isPending && (
        <>
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2rem" screenreaderText={t('infra.loading')} />
        </>
      )}

      {!vmsQuery.isPending && vmsQuery.isError && (
        <EmptyState titleText={t('infra.error.title')} status="danger">
          <EmptyStateBody>
            {vmsQuery.error instanceof Error ? vmsQuery.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void vmsQuery.refetch()}>
                <FormattedMessage id="action.retry" />
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {!vmsQuery.isPending && !vmsQuery.isError && (
        <>
          {table.paged.length === 0 ? (
            <EmptyState titleText={t('infra.vms.empty.title')}>
              <EmptyStateBody>
                <FormattedMessage id="infra.vms.empty.body" />
              </EmptyStateBody>
            </EmptyState>
          ) : (
            <InfraGrid
              ariaLabel={t('infra.vms.ariaLabel')}
              table={table}
              rowKey={(row) => row.vm.id}
              // the same one-kebab row actions as the VMs & Templates view
              // (Migrate folded in)
              rowActions={(row) => <VmActionsMenu vm={row.vm} includeMigrate />}
              onRowContextMenu={(event, row) => onRowContextMenu(event, row.vm)}
            />
          )}
        </>
      )}
    </>
  )
}
