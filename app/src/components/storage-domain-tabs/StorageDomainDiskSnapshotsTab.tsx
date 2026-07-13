import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { listStorageDomainDiskSnapshots } from '../../api/resources/diskSnapshots'
import { STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'
import { useSettings } from '../../settings/SettingsProvider'
import { StatusBadge } from '../StatusBadge'

const DASH = '—'

// The disksnapshots subcollection isn't part of the shared
// useStorageDomainDetail module (owned elsewhere), so its query rides here
// inline — same posture as StorageDomainImagesTab. Same ['storagedomain', id,
// …] key prefix and 60s floor as the sibling subcollections.
function useStorageDomainDiskSnapshots(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomain', id, 'disksnapshots'],
    queryFn: () => listStorageDomainDiskSnapshots(id),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })
}

// oVirt disk-image states are ok/locked/illegal — same coloring policy as
// DiskDetailPage's DiskStatusLabel.
const SNAPSHOT_STATUS_COLOR: Record<string, 'green' | 'blue' | 'red'> = {
  ok: 'green',
  locked: 'blue',
  illegal: 'red',
}

function SnapshotStatusLabel({ status }: { status?: string }) {
  if (!status) return <>{DASH}</>
  return (
    <StatusBadge color={SNAPSHOT_STATUS_COLOR[status.toLowerCase()] ?? 'grey'}>
      {statusText(status)}
    </StatusBadge>
  )
}

// The storage domain's Disk Snapshots subtab (webadmin's read-only grid of the
// snapshot images living on the domain). The alias is the parent disk's alias
// (DiskSnapshot extends Disk), so it doubles as the disk link's label — the
// bare disk link itself carries only the id.
export function StorageDomainDiskSnapshotsTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const snapshots = useStorageDomainDiskSnapshots(storageDomainId)

  if (snapshots.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText="Loading disk snapshots" />
      </>
    )
  }

  if (snapshots.isError) {
    return (
      <EmptyState titleText="Could not load disk snapshots" status="danger">
        <EmptyStateBody>
          {snapshots.error instanceof Error ? snapshots.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void snapshots.refetch()}>
          {t('common.action.retry')}
        </Button>
      </EmptyState>
    )
  }

  if (snapshots.data.length === 0) {
    return (
      <EmptyState titleText="No disk snapshots">
        <EmptyStateBody>
          Snapshot images of VM disks stored on this domain appear here.
        </EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label="Disk snapshots" variant="compact">
      <Thead>
        <Tr>
          <Th>Disk</Th>
          <Th>{t('common.field.description')}</Th>
          <Th>{t('common.field.status')}</Th>
          <Th>Provisioned Size</Th>
          {/* actual_size is intentionally left out: 4 data columns keeps the
              tab under the ColumnPicker threshold and webadmin leads with the
              virtual size here too */}
        </Tr>
      </Thead>
      <Tbody>
        {snapshots.data.map((snapshot) => (
          <Tr key={snapshot.id}>
            <Td dataLabel="Disk">
              {snapshot.disk?.id ? (
                <Link to="/disks/$diskId" params={{ diskId: snapshot.disk.id }}>
                  {snapshot.alias ?? snapshot.disk.id}
                </Link>
              ) : (
                (snapshot.alias ?? DASH)
              )}
            </Td>
            <Td dataLabel={t('common.field.description')} modifier="truncate">
              <span title={snapshot.description}>{snapshot.description ?? DASH}</span>
            </Td>
            <Td dataLabel={t('common.field.status')}>
              <SnapshotStatusLabel status={snapshot.status} />
            </Td>
            <Td dataLabel="Provisioned Size">{formatBytes(snapshot.provisioned_size)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
