import { useState } from 'react'
import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { Vm } from '../../api/schemas/vm'
import { useUnregisteredStorageDomainVms } from '../../hooks/useStorageDomainDetail'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { osDisplayName } from '../../lib/os-names'
import { RegisterEntityModal } from '../storage-domain-form/RegisterEntityModal'

// The unregistered VMs sitting in a data domain's OVF store — the cross-DC move
// mechanism: a domain detached from one data center and attached to another
// carries VMs the engine has not yet imported. Each row's Register imports one
// into a chosen cluster (RegisterEntityModal). The list is a plain DB read
// (GetUnregisteredVms), 404-tolerant → empty list, and empty is the common case
// (the OVF store is usually empty). Names are NOT Link-wrapped: an unregistered
// VM has no id in the engine's /vms collection yet.
export function StorageDomainRegisterVmsTab({ storageDomainId }: { storageDomainId: string }) {
  const t = useT()
  const vms = useUnregisteredStorageDomainVms(storageDomainId)
  const [registering, setRegistering] = useState<Vm | null>(null)

  if (vms.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('storageRegisterVms.loading')} />
      </>
    )
  }

  if (vms.isError) {
    return (
      <EmptyState titleText={t('storageRegisterVms.error.title')} status="danger">
        <EmptyStateBody>
          {vms.error instanceof Error ? vms.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void vms.refetch()}>
          {t('common.action.retry')}
        </Button>
      </EmptyState>
    )
  }

  if (vms.data.length === 0) {
    return (
      <EmptyState titleText={t('storageRegisterVms.empty.title')}>
        <EmptyStateBody>{t('storageRegisterVms.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <>
      <Table aria-label={t('storageRegisterVms.table.ariaLabel')} variant="compact">
        <Thead>
          <Tr>
            <Th>{t('common.field.name')}</Th>
            <Th>{t('storageRegister.column.operatingSystem')}</Th>
            <Th>{t('storageRegister.column.memory')}</Th>
            <Th screenReaderText={t('common.field.actions')} />
          </Tr>
        </Thead>
        <Tbody>
          {vms.data.map((vm) => (
            <Tr key={vm.id}>
              <Td dataLabel={t('common.field.name')}>{vm.name}</Td>
              <Td dataLabel={t('storageRegister.column.operatingSystem')}>
                {osDisplayName(vm.os?.type) ?? '—'}
              </Td>
              <Td dataLabel={t('storageRegister.column.memory')}>{formatBytes(vm.memory)}</Td>
              <Td dataLabel={t('common.field.actions')} isActionCell>
                <Button
                  variant="secondary"
                  onClick={() => setRegistering(vm)}
                  aria-label={t('storageRegister.action.registerNamed', { name: vm.name })}
                >
                  {t('storageRegister.action.register')}
                </Button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {registering && (
        <RegisterEntityModal
          storageDomainId={storageDomainId}
          kind="vm"
          entity={{ id: registering.id, name: registering.name }}
          isOpen
          onClose={() => setRegistering(null)}
        />
      )}
    </>
  )
}
