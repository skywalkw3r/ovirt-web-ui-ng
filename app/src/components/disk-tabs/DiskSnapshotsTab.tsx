import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import {
  listStorageDomainDiskSnapshots,
  type DiskSnapshot,
} from '../../api/resources/diskSnapshots'
import type { Disk } from '../../api/schemas/disk'
import { DISK_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useDiskDetail'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'
import { useSettings } from '../../settings/SettingsProvider'
import { StatusBadge } from '../StatusBadge'

const DASH = '—'

// The 4.5 API exposes disk snapshots ONLY as a storage-domain subcollection
// (GET /storagedomains/{id}/disksnapshots — no per-disk equivalent), so this
// tab reads the domain(s) the disk links via its storage_domains follow
// (getDisk) and filters client-side on snapshot.disk.id — the same
// cross-collection posture as useDiskStorageDomains. An image disk lives on
// one domain; the Promise.all covers the exotic multi-domain case anyway.
// Keyed under the ['disk', id, …] prefix so the detail page's wholesale
// invalidate refreshes it too.
function useDiskSnapshots(disk: Disk, storageDomainIds: string[]) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['disk', disk.id, 'disksnapshots', [...storageDomainIds].sort().join(',')],
    queryFn: async (): Promise<DiskSnapshot[]> => {
      const lists = await Promise.all(
        storageDomainIds.map((sdId) => listStorageDomainDiskSnapshots(sdId)),
      )
      return lists.flat().filter((snapshot) => snapshot.disk?.id === disk.id)
    },
    enabled: storageDomainIds.length > 0,
    refetchInterval: Math.max(refreshIntervalMs, DISK_DETAIL_POLL_INTERVAL_MS),
  })
}

// same coloring policy as DiskDetailPage's DiskStatusLabel
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

// The disk detail Snapshots tab: the point-in-time images in this disk's
// snapshot chain (created by VM snapshots that included the disk).
export function DiskSnapshotsTab({ disk }: { disk: Disk }) {
  const t = useT()
  const storageDomainIds = (disk.storage_domains?.storage_domain ?? [])
    .map((sd) => sd.id)
    .filter((id): id is string => id !== undefined)
  const snapshots = useDiskSnapshots(disk, storageDomainIds)

  // A direct-LUN (or cinder/unattached) disk links no storage domain — there
  // is no image chain to list, and the gated query above never runs (its
  // isPending would otherwise spin forever).
  if (storageDomainIds.length === 0) {
    return (
      <EmptyState titleText="No snapshots">
        <EmptyStateBody>
          Only image disks on a storage domain carry snapshots — direct-LUN disks have no snapshot
          chain.
        </EmptyStateBody>
      </EmptyState>
    )
  }

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
      <EmptyState titleText="No snapshots">
        <EmptyStateBody>
          Taking a VM snapshot that includes this disk creates an image here.
        </EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label="Disk snapshots" variant="compact">
      <Thead>
        <Tr>
          <Th>{t('common.field.description')}</Th>
          <Th>{t('common.field.status')}</Th>
          <Th>Provisioned Size</Th>
          <Th>Actual Size</Th>
        </Tr>
      </Thead>
      <Tbody>
        {snapshots.data.map((snapshot) => (
          <Tr key={snapshot.id}>
            <Td dataLabel={t('common.field.description')} modifier="truncate">
              <span title={snapshot.description}>{snapshot.description ?? DASH}</span>
            </Td>
            <Td dataLabel={t('common.field.status')}>
              <SnapshotStatusLabel status={snapshot.status} />
            </Td>
            <Td dataLabel="Provisioned Size">{formatBytes(snapshot.provisioned_size)}</Td>
            <Td dataLabel="Actual Size">{formatBytes(snapshot.actual_size)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
