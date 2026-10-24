import { useMemo, type ReactNode } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Thead, Tr } from '@patternfly/react-table'
import type { HostDevice } from '../../api/schemas/host-device'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useHostDevices } from '../../hooks/useHostDetail'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { ResizableTh, resizableTableProps } from '../list-toolbar/ResizableTh'

// vendor/product arrive as { name } on current engines but as a bare string on
// older ones (the schema accepts both) — resolve either form to the reported
// value, or undefined when there is none.
function namedValue(value: HostDevice['vendor']): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value || undefined
  return value.name
}

// The same resolution rendered as a plain label. sortValue reads namedValue
// instead, so devices reporting no vendor/product sink to the end of a sort
// rather than ordering under a literal em dash.
function named(value: HostDevice['vendor']): string {
  return namedValue(value) ?? '—'
}

interface DeviceColumn {
  key: string
  labelId: MessageId
  always?: boolean
  // opt-in header sort (see hooks/useColumnSort)
  sortValue?: (device: HostDevice) => string | number | undefined
}

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Name pinned). Labels resolve per-locale in the component (the DisksTab
// idiom). Headers and cells both map over the same isVisible-filtered array so
// they can never desync.
const COLUMNS: DeviceColumn[] = [
  { key: 'name', labelId: 'common.field.name', always: true, sortValue: (device) => device.name },
  {
    key: 'capability',
    labelId: 'vmHostDevices.column.capability',
    sortValue: (device) => device.capability || undefined,
  },
  {
    key: 'driver',
    labelId: 'hostDevices.column.driver',
    sortValue: (device) => device.driver || undefined,
  },
  {
    key: 'vendor',
    labelId: 'vmHostDevices.column.vendor',
    sortValue: (device) => namedValue(device.vendor),
  },
  {
    key: 'product',
    labelId: 'vmHostDevices.column.product',
    sortValue: (device) => namedValue(device.product),
  },
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
  const t = useT()
  const devices = useHostDevices(hostId)
  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('host-devices', columns)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()
  const visibleColumns = columns.filter((column) => prefs.isVisible(column.key))
  const sortedDevices = sortRows(devices.data ?? [], sort, (device, key) =>
    COLUMNS.find((column) => column.key === key)?.sortValue?.(device),
  )

  return (
    <>
      {devices.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmHostDevices.loading')} />
        </>
      )}

      {devices.isError && (
        <EmptyState titleText={t('vmHostDevices.error.title')} status="danger">
          <EmptyStateBody>
            {devices.error instanceof Error ? devices.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void devices.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length === 0 && (
        <EmptyState titleText={t('vmHostDevices.empty.title')}>
          <EmptyStateBody>{t('hostDevices.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length > 0 && (
        <>
          <Toolbar inset={{ default: 'insetNone' }}>
            <ToolbarContent>
              <ToolbarGroup align={{ default: 'alignEnd' }}>
                <ToolbarItem>
                  <ColumnPicker
                    columns={columns}
                    isVisible={prefs.isVisible}
                    onToggle={prefs.toggle}
                    onReset={prefs.reset}
                  />
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>
          <div className="app-table-viewport">
            <Table
              aria-label={t('hostDevices.table.ariaLabel')}
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
                {sortedDevices.map((device: HostDevice) => (
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
