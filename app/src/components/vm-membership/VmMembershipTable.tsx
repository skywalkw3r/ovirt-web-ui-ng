import type { ReactNode } from 'react'
import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Vm } from '../../api/schemas/vm'
import type { ColumnPrefs } from '../../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'
import type { VmMembershipColumn } from './columns'

// The four-state shell shared by every "VMs of <parent>" tab (cluster, pool,
// template, quota — pair with useVmMembership): Skeleton, danger EmptyState +
// Retry, EmptyState with per-parent body text, compact table of VM rows.
// `toolbar` (the quota tab's ColumnPicker) renders above the table in the
// populated state only, matching the pre-extraction markup. `resizePrefs`
// opts a useColumnPrefs-backed tab into the drag-resizable-columns rollout:
// headers become ResizableTh and the table rides an .app-table-viewport
// scroll box (the quota tab; the ≤3-column tabs stay fluid).
export function VmMembershipTable({
  query,
  columns,
  ariaLabel,
  emptyBody,
  toolbar,
  resizePrefs,
}: {
  query: UseQueryResult<Vm[], Error>
  columns: VmMembershipColumn[]
  ariaLabel: string
  emptyBody: string
  toolbar?: ReactNode
  resizePrefs?: ColumnPrefs
}) {
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Called before the early returns
  // below so hook order stays stable across the four states.
  const { sort, thSort } = useColumnSort()

  if (query.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText="Loading virtual machines" />
      </>
    )
  }

  if (query.isError) {
    return (
      <EmptyState titleText="Could not load virtual machines" status="danger">
        <EmptyStateBody>
          {query.error instanceof Error ? query.error.message : 'Unknown error'}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  if (query.data.length === 0) {
    return (
      <EmptyState titleText="No virtual machines">
        <EmptyStateBody>{emptyBody}</EmptyStateBody>
      </EmptyState>
    )
  }

  const rows = sortRows(query.data, sort, (vm, key) =>
    columns.find((column) => column.key === key)?.sortValue?.(vm),
  )

  const table = (
    <Table
      aria-label={ariaLabel}
      variant="compact"
      {...(resizePrefs ? resizableTableProps(resizePrefs) : {})}
    >
      <Thead>
        <Tr>
          {columns.map((column, index) => {
            const sortProps =
              column.sortValue !== undefined
                ? thSort(
                    columns.map((c) => c.key),
                    index,
                  )
                : undefined
            return resizePrefs ? (
              <ResizableTh
                key={column.key}
                columnKey={column.key}
                label={column.label}
                prefs={resizePrefs}
                presetWidth={column.width}
                sort={sortProps}
              >
                {column.label}
              </ResizableTh>
            ) : (
              <Th key={column.key} width={column.width} sort={sortProps}>
                {column.label}
              </Th>
            )
          })}
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((vm) => (
          <Tr key={vm.id}>
            {columns.map((column) => (
              <Td
                key={column.key}
                dataLabel={column.label}
                modifier={column.modifier}
                title={column.title?.(vm)}
              >
                {column.render(vm)}
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  )

  return (
    <>
      {toolbar}
      {resizePrefs ? <div className="app-table-viewport">{table}</div> : table}
    </>
  )
}
