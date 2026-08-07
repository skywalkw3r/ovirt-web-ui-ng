import { useQuery } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { listStorageDomainLeaseVms } from '../../api/resources/leases'
import { useT } from '../../i18n/useT'
import { useSettings } from '../../settings/SettingsProvider'

// The lease list drifts slowly and only loads while the storage domain detail
// page is mounted; 60s matches the other storage domain subcollections
// (useStorageDomainDetail). The constant is a floor — the Preferences interval
// can slow the poll further, never speed it up past the VM cadence. Shares the
// ['storagedomain', id, …] key prefix so a domain-wide invalidate refetches it
// too.
const LEASES_POLL_INTERVAL_MS = 60_000

export function StorageDomainLeasesTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const { refreshIntervalMs } = useSettings()
  const leases = useQuery({
    queryKey: ['storagedomain', storageDomainId, 'leases'],
    queryFn: () => listStorageDomainLeaseVms(storageDomainId),
    refetchInterval: Math.max(refreshIntervalMs, LEASES_POLL_INTERVAL_MS),
  })

  return (
    <>
      {leases.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('storage.leases.loading')} />
        </>
      )}

      {leases.isError && (
        <EmptyState titleText={t('storage.leases.error.title')} status="danger">
          <EmptyStateBody>
            {leases.error instanceof Error ? leases.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void leases.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {leases.isSuccess && leases.data.length === 0 && (
        <EmptyState titleText={t('storage.leases.empty.title')}>
          <EmptyStateBody>{t('storage.leases.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {leases.isSuccess && leases.data.length > 0 && (
        <Table aria-label={t('storage.leases.tab')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('storage.leases.column.vm')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {leases.data.map((vm) => (
              <Tr key={vm.id}>
                <Td dataLabel={t('storage.leases.column.vm')}>
                  <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
                    {vm.name ?? vm.id}
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
