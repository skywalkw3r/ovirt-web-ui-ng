import type { ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateBody,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Thead, Tr } from '@patternfly/react-table'
import type { HostDevice } from '../../api/schemas/host-device'
import { useColumnPrefs, type ColumnDef } from '../../hooks/useColumnPrefs'
import { useHostDevices } from '../../hooks/useHostDetail'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'

// vendor/product arrive as { name } on current engines but as a bare string on
// older ones (the schema accepts both) — resolve either form to a plain label.
function named(value: HostDevice['vendor']): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value || '—'
  return value.name ?? '—'
}

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Name pinned). Labels stay hardcoded English like the rest of this tab.
// Headers and cells both map over the same isVisible-filtered array so they
// can never desync.
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', always: true },
  { key: 'capability', label: 'Capability' },
  { key: 'driver', label: 'Driver' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'product', label: 'Product' },
]

function cellOf(device: HostDevice, key: string): ReactNode {
  switch (key) {
    case 'name':
      return device.name ?? '—'
    case 'capability':
      return device.capability ?? '—'
    case 'driver':
      return device.driver ?? '—'
    case 'vendor':
      return named(device.vendor)
    case 'product':
      return named(device.product)
    default:
      return '—'
  }
}

export function HostDevicesTab({ hostId }: { hostId: string }) {
  const devices = useHostDevices(hostId)
  const prefs = useColumnPrefs('host-devices', COLUMNS)
  const visibleColumns = COLUMNS.filter((column) => prefs.isVisible(column.key))

  return (
    <>
      {devices.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading host devices" />
        </>
      )}

      {devices.isError && (
        <EmptyState titleText="Could not load host devices" status="danger">
          <EmptyStateBody>
            {devices.error instanceof Error ? devices.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void devices.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length === 0 && (
        <EmptyState titleText="No host devices">
          <EmptyStateBody>This host reports no PCI or USB devices.</EmptyStateBody>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length > 0 && (
        <>
          <Toolbar inset={{ default: 'insetNone' }}>
            <ToolbarContent>
              <ToolbarGroup align={{ default: 'alignEnd' }}>
                <ToolbarItem>
                  <ColumnPicker
                    columns={COLUMNS}
                    isVisible={prefs.isVisible}
                    onToggle={prefs.toggle}
                    onReset={prefs.reset}
                  />
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>
          <div className="app-table-viewport">
            <Table aria-label="Host devices" variant="compact" {...resizableTableProps(prefs)}>
              <Thead>
                <Tr>
                  {visibleColumns.map((column) => (
                    <ResizableTh
                      key={column.key}
                      columnKey={column.key}
                      label={column.label}
                      prefs={prefs}
                    >
                      {column.label}
                    </ResizableTh>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {devices.data.map((device: HostDevice) => (
                  <Tr key={device.id}>
                    {visibleColumns.map((column) => (
                      <Td key={column.key} dataLabel={column.label}>
                        {cellOf(device, column.key)}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </>
      )}
    </>
  )
}
