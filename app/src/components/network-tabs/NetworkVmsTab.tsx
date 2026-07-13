import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useNetworkVms } from './useNetworkMembership'
import { useT } from '../../i18n/useT'
import { VmStatusLabel } from '../VmStatusLabel'

// VMs with a vNIC on this network. No server-side read exists (NetworkService
// has no vms locator), so useNetworkVms derives membership from the network's
// vNIC profiles + a single GET /vms?follow=nics join — see resources/networks.ts.
export function NetworkVmsTab({ networkId }: { networkId: string }) {
  const t = useT()
  const vms = useNetworkVms(networkId)

  return (
    <>
      {vms.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('viewState.loading')} />
        </>
      )}

      {vms.isError && (
        <EmptyState titleText={t('viewState.error')} status="danger">
          <EmptyStateBody>
            {vms.error instanceof Error ? vms.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void vms.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {vms.isSuccess && vms.data.length === 0 && <EmptyState titleText={t('viewState.empty')} />}

      {vms.isSuccess && vms.data.length > 0 && (
        <Table aria-label={t('networkDetail.tab.vms')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('common.field.status')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {vms.data.map((vm) => (
              <Tr key={vm.id}>
                <Td dataLabel={t('common.field.name')}>
                  <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
                    {vm.name}
                  </Link>
                </Td>
                <Td dataLabel={t('common.field.status')}>
                  <VmStatusLabel status={vm.status} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
