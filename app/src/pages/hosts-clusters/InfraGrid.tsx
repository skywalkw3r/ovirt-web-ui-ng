import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { ResizableTh, resizableTableProps } from '../../components/list-toolbar/ResizableTh'
import { useT } from '../../i18n/useT'
import { isInteractiveTarget } from './infraModel'
import type { PaneTable } from './usePaneTable'

// The one grid every Hosts & Clusters pane renders: resizable, sortable
// headers over the pane table's visible columns, one row per paged entity,
// cells mapping over the same filtered column array as the headers so the two
// can never desync. The three ways the panes differ ride as props — a row
// kebab (hosts, VMs), a row click that drills the tree (clusters, data
// centers), and a right-click menu — so each pane keeps its own posture
// (read/browse vs. actionable) on identical markup.
export function InfraGrid<Row, Ctx>({
  ariaLabel,
  table,
  rowKey,
  rowActions,
  onRowClick,
  onRowContextMenu,
}: {
  ariaLabel: string
  table: PaneTable<Row, Ctx>
  rowKey: (row: Row) => string
  // the row's kebab — its presence adds the trailing actions column
  rowActions?: (row: Row) => ReactNode
  // drill on a row click that lands on the row itself (links, buttons and
  // inputs keep their own behavior); its presence marks the rows clickable
  onRowClick?: (row: Row) => void
  onRowContextMenu?: (event: ReactMouseEvent, row: Row) => void
}) {
  const t = useT()
  const { visibleColumns, prefs, sort, paged, ctx } = table
  return (
    <div className="app-table-viewport">
      <Table aria-label={ariaLabel} variant="compact" {...resizableTableProps(prefs)}>
        <Thead>
          <Tr>
            {visibleColumns.map((column, index) => (
              <ResizableTh
                key={column.key}
                columnKey={column.key}
                label={column.label}
                prefs={prefs}
                presetWidth={column.width}
                modifier={column.modifier}
                sort={
                  column.sortValue !== undefined
                    ? sort.thSort(
                        visibleColumns.map((c) => c.key),
                        index,
                      )
                    : undefined
                }
              >
                {column.label}
              </ResizableTh>
            ))}
            {rowActions !== undefined && <Th screenReaderText={t('common.field.actions')} />}
          </Tr>
        </Thead>
        <Tbody>
          {paged.map((row) => (
            <Tr
              key={rowKey(row)}
              isClickable={onRowClick !== undefined ? true : undefined}
              onClick={
                onRowClick !== undefined
                  ? (event) => {
                      if (isInteractiveTarget(event.target)) return
                      onRowClick(row)
                    }
                  : undefined
              }
              onContextMenu={
                onRowContextMenu !== undefined ? (event) => onRowContextMenu(event, row) : undefined
              }
            >
              {visibleColumns.map((column) => (
                <Td
                  key={column.key}
                  dataLabel={column.label}
                  modifier={column.modifier}
                  title={column.title?.(row)}
                >
                  {column.cell(row, ctx)}
                </Td>
              ))}
              {rowActions !== undefined && (
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  {rowActions(row)}
                </Td>
              )}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  )
}
