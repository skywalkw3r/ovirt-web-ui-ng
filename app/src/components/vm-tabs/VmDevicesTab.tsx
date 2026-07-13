import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { ReportedDevice } from '../../api/schemas/reported-device'
import { useVmDevices } from '../../hooks/useVmDetail'
import { useT } from '../../i18n/useT'

// The virtual devices the guest agent reports (GET /vms/{id}/reporteddevices).
// The engine nests IPs as { ips: { ip: [{ address }] } }; flatten the addresses
// into a single cell.
function ipList(device: ReportedDevice): string {
  const ips = (device.ips?.ip ?? [])
    .map((entry) => entry.address)
    .filter((address): address is string => Boolean(address))
  return ips.length > 0 ? ips.join(', ') : '—'
}

export function VmDevicesTab({ vmId }: { vmId: string }) {
  const t = useT()
  const devices = useVmDevices(vmId)

  return (
    <>
      {devices.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vmDevices.loading')} />
        </>
      )}

      {devices.isError && (
        <EmptyState titleText={t('vmDevices.error.title')} status="danger">
          <EmptyStateBody>
            {devices.error instanceof Error ? devices.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void devices.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length === 0 && (
        <EmptyState titleText={t('vmDevices.empty.title')}>
          <EmptyStateBody>{t('vmDevices.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {devices.isSuccess && devices.data.length > 0 && (
        <Table aria-label={t('vmDevices.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('vmDevices.column.mac')}</Th>
              <Th>{t('vmDevices.column.ips')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {devices.data.map((device: ReportedDevice) => (
              <Tr key={device.id}>
                <Td dataLabel={t('common.field.name')}>{device.name ?? '—'}</Td>
                <Td dataLabel={t('vmDevices.column.mac')}>{device.mac?.address ?? '—'}</Td>
                <Td dataLabel={t('vmDevices.column.ips')}>{ipList(device)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
