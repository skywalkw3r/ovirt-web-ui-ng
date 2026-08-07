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
import { StatusBadge } from '../StatusBadge'
import type { Disk } from '../../api/schemas/disk'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useStorageDomainDisks } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { diskContentTypeText, formatBytes, statusText } from '../../lib/format'

// oVirt disk states are ok/locked/illegal; anything unrecognized stays grey
const DISK_STATUS_COLOR: Record<string, 'green' | 'blue' | 'red'> = {
  ok: 'green',
  locked: 'blue',
  illegal: 'red',
}

function DiskStatusLabel({ status }: { status: string | undefined }) {
  if (!status) return <>—</>
  return <StatusBadge color={DISK_STATUS_COLOR[status] ?? 'grey'}>{statusText(status)}</StatusBadge>
}

// The engine surfaces `alias` as the user-visible disk name; fall back to
// `name` for disks (e.g. LUN-backed) that never got an alias.
function diskDisplayName(disk: Disk): string | undefined {
  return disk.alias || disk.name
}

// Every column in visual order so each Th's index matches its position; Status
// stays unsortable — it is a state chip, not a scannable value.
const STORAGE_DISK_KEYS = [
  'aliasName',
  'provisionedSize',
  'actualSize',
  'status',
  'contentType',
] as const

export function StorageDomainDisksTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const disks = useStorageDomainDisks(storageDomainId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  // Both sizes sort on the raw byte counts the cells hand formatBytes, so 900
  // GiB lands under 1 TiB instead of collating by the rendered string. This is
  // the domain's own disk list, so provisioned_size is read straight (no
  // diskSizeBytes LUN fallback) — exactly what the cell renders.
  const sortedDisks = sortRows(disks.data ?? [], sort, (disk, key) =>
    key === 'aliasName'
      ? diskDisplayName(disk)
      : key === 'provisionedSize'
        ? disk.provisioned_size
        : key === 'actualSize'
          ? disk.actual_size
          : key === 'contentType'
            ? disk.content_type
            : undefined,
  )

  return (
    <>
      {disks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('storageDisks.loading')} />
        </>
      )}

      {disks.isError && (
        <EmptyState titleText={t('storageDisks.error.title')} status="danger">
          <EmptyStateBody>
            {disks.error instanceof Error ? disks.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void disks.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length === 0 && (
        <EmptyState titleText={t('storageDisks.empty.title')}>
          <EmptyStateBody>{t('storageDisks.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {disks.isSuccess && disks.data.length > 0 && (
        <Table aria-label={t('storageDisks.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(STORAGE_DISK_KEYS, 0)}>{t('storageDisks.column.aliasName')}</Th>
              <Th sort={thSort(STORAGE_DISK_KEYS, 1)}>
                {t('storageDisks.column.provisionedSize')}
              </Th>
              <Th sort={thSort(STORAGE_DISK_KEYS, 2)}>{t('storageDisks.column.actualSize')}</Th>
              <Th>{t('common.field.status')}</Th>
              <Th sort={thSort(STORAGE_DISK_KEYS, 4)}>{t('storageDisks.column.contentType')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedDisks.map((disk) => (
              <Tr key={disk.id}>
                <Td dataLabel={t('storageDisks.column.aliasName')}>
                  {disk.id ? (
                    <Link to="/disks/$diskId" params={{ diskId: disk.id }}>
                      {diskDisplayName(disk) ?? '—'}
                    </Link>
                  ) : (
                    (diskDisplayName(disk) ?? '—')
                  )}
                </Td>
                <Td dataLabel={t('storageDisks.column.provisionedSize')}>
                  {formatBytes(disk.provisioned_size)}
                </Td>
                <Td dataLabel={t('storageDisks.column.actualSize')}>
                  {formatBytes(disk.actual_size)}
                </Td>
                <Td dataLabel={t('common.field.status')}>
                  <DiskStatusLabel status={disk.status} />
                </Td>
                <Td dataLabel={t('storageDisks.column.contentType')}>
                  {diskContentTypeText(disk.content_type)}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
