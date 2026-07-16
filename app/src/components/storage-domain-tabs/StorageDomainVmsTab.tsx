import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useStorageDomainVms } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { VmStatusLabel } from '../VmStatusLabel'

// Every column in visual order so each Th's index matches its position; Status
// stays unsortable — it is a state chip, not a scannable value.
const STORAGE_VM_KEYS = ['name', 'status'] as const

// The VMs whose disks live on this storage domain, straight from the engine's
// /storagedomains/{id}/vms subcollection (404-tolerant → empty list for domain
// types that have no VM view, e.g. ISO domains). Mirrors TemplateVmsTab's
// four-state shell.
export function StorageDomainVmsTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const vms = useStorageDomainVms(storageDomainId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the early returns so
  // hook order stays stable.
  const { sort, thSort } = useColumnSort()

  if (vms.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('storageVms.loading')} />
      </>
    )
  }

  if (vms.isError) {
    return (
      <EmptyState titleText={t('storageVms.error.title')} status="danger">
        <EmptyStateBody>
          {vms.error instanceof Error ? vms.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void vms.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (vms.data.length === 0) {
    return (
      <EmptyState titleText={t('storageVms.empty.title')}>
        <EmptyStateBody>{t('storageVms.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  const sortedVms = sortRows(vms.data, sort, (vm, key) => (key === 'name' ? vm.name : undefined))

  return (
    <Table aria-label={t('storageVms.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th sort={thSort(STORAGE_VM_KEYS, 0)}>{t('common.field.name')}</Th>
          <Th>{t('common.field.status')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sortedVms.map((vm) => (
          <Tr key={vm.id}>
            <Td dataLabel={t('common.field.name')}>
              {vm.id ? (
                <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
                  {vm.name}
                </Link>
              ) : (
                vm.name
              )}
            </Td>
            <Td dataLabel={t('common.field.status')}>
              <VmStatusLabel status={vm.status} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
