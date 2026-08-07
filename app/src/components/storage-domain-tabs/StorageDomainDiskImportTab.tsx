import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { StatusBadge } from '../StatusBadge'
import { ConfirmModal } from '../ConfirmModal'
import type { Disk } from '../../api/schemas/disk'
import { diskSizeBytes } from '../../api/schemas/disk'
import {
  listUnregisteredStorageDomainDisks,
  registerStorageDomainDisk,
} from '../../api/resources/storageDomains'
import { STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS } from '../../hooks/useStorageDomainDetail'
import { useSettings } from '../../settings/SettingsProvider'
import { useNotify } from '../../notifications/context'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'

// oVirt disk states are ok/locked/illegal; anything unrecognized stays grey
// (same mapping as StorageDomainDisksTab).
const DISK_STATUS_COLOR: Record<string, 'green' | 'blue' | 'red'> = {
  ok: 'green',
  locked: 'blue',
  illegal: 'red',
}

function DiskStatusLabel({ status }: { status: string | undefined }) {
  if (!status) return <>—</>
  return <StatusBadge color={DISK_STATUS_COLOR[status] ?? 'grey'}>{statusText(status)}</StatusBadge>
}

// The engine surfaces `alias` as the user-visible disk name; fall back to `name`
// then the id (a floating disk left by another engine may carry only its id).
function diskDisplayName(disk: Disk): string {
  return disk.alias || disk.name || disk.id
}

// The SD Disk Import subtab: the unregistered ("floating") disk images sitting on
// an attached data domain that this engine has not imported yet (the cross-engine
// move mechanism for bare disks, mirroring the Register VMs/Templates subtabs for
// OVF-store entities). GET .../disks?unregistered=true → GetUnregisteredDisks;
// per-row Register (POST .../disks/{diskId}/register → RegisterDisk) imports one,
// behind a confirmation. Scan re-runs the (SPM-backed) discovery via refetch.
// The listing is 404-tolerant → empty, and empty is the common case, so the four
// states below carry the (usually blank) result. Gated to attached data domains
// by StorageDomainDetailPage, matching webadmin's Disk Import sub-tab.
export function StorageDomainDiskImportTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const { refreshIntervalMs } = useSettings()
  const { notify } = useNotify()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<Disk | null>(null)

  const disks = useQuery({
    queryKey: ['storagedomain', storageDomainId, 'unregistered-disks'],
    queryFn: () => listUnregisteredStorageDomainDisks(storageDomainId),
    // Same 60s floor as the sibling detail subcollections — the Preferences
    // interval can slow it, never speed it past the VM cadence.
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_DETAIL_POLL_INTERVAL_MS),
  })

  // Registering a disk drops it from the unregistered listing and adds it to the
  // domain's regular Disks tab, so on settle both slices — plus the domain
  // wholesale — are invalidated. Toasts are hardcoded English to match the
  // app's mutation layer (useStorageDomainMutations).
  const register = useMutation({
    mutationFn: (disk: Disk) => registerStorageDomainDisk(storageDomainId, disk.id),
    onSuccess: (_data, disk) => {
      notify({ title: `Disk ${diskDisplayName(disk)} registered`, variant: 'success' })
    },
    onError: (error: unknown) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({
        title: error instanceof Error ? error.message : t('common.error.unknown'),
        variant: 'danger',
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['storagedomain', storageDomainId, 'unregistered-disks'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['storagedomain', storageDomainId, 'disks'],
      })
      void queryClient.invalidateQueries({ queryKey: ['storagedomain', storageDomainId] })
    },
  })

  return (
    <>
      {/* Scan is always available (even while empty) so a freshly-attached
          domain can be rescanned without leaving the tab. */}
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarItem>
            <Button
              variant="secondary"
              onClick={() => void disks.refetch()}
              isLoading={disks.isFetching}
              isDisabled={disks.isFetching}
            >
              {t('storage.diskImport.scan')}
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {disks.isPending && (
        <>
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
        <EmptyState titleText={t('storage.diskImport.empty.title')}>
          <EmptyStateBody>{t('storage.diskImport.empty.body')}</EmptyStateBody>
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
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {disks.data.map((disk) => (
              <Tr key={disk.id}>
                <Td dataLabel={t('storageDisks.column.aliasName')}>{diskDisplayName(disk)}</Td>
                <Td dataLabel={t('storageDisks.column.provisionedSize')}>
                  {formatBytes(diskSizeBytes(disk))}
                </Td>
                <Td dataLabel={t('storageDisks.column.actualSize')}>
                  {formatBytes(disk.actual_size)}
                </Td>
                <Td dataLabel={t('common.field.status')}>
                  <DiskStatusLabel status={disk.status} />
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirming(disk)}
                    isDisabled={register.isPending}
                    aria-label={t('storageRegister.action.registerNamed', {
                      name: diskDisplayName(disk),
                    })}
                  >
                    {t('storage.diskImport.register')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* Register imports a disk of unknown provenance into the engine — a
          meaningful state change, so it rides behind a confirmation. */}
      {confirming && (
        <ConfirmModal
          isOpen
          title={t('storage.diskImport.register.confirm.title')}
          confirmLabel={t('storage.diskImport.register')}
          body={t('storage.diskImport.register.confirm.body', {
            name: diskDisplayName(confirming),
          })}
          onConfirm={() => {
            register.mutate(confirming)
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}
