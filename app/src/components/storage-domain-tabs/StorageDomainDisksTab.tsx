import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import { StatusBadge } from '../StatusBadge'
import type { Disk } from '../../api/schemas/disk'
import { useStorageDomainDisks } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'

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

export function StorageDomainDisksTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const disks = useStorageDomainDisks(storageDomainId)

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
          <Button variant="primary" onClick={() => void disks.refetch()}>
            {t('common.action.retry')}
          </Button>
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
              <Th>{t('storageDisks.column.aliasName')}</Th>
              <Th>{t('storageDisks.column.provisionedSize')}</Th>
              <Th>{t('storageDisks.column.actualSize')}</Th>
              <Th>{t('common.field.status')}</Th>
              <Th>{t('storageDisks.column.contentType')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {disks.data.map((disk) => (
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
                <Td dataLabel={t('storageDisks.column.contentType')}>{disk.content_type ?? '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
