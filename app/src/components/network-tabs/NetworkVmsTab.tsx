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
import { useNetworkVms } from './useNetworkMembership'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useT } from '../../i18n/useT'
import { VmStatusLabel } from '../VmStatusLabel'

// Every column in visual order so each Th's index matches its position; Status
// stays unsortable — it is a state chip, not a scannable value.
const NETWORK_VM_KEYS = ['name', 'status'] as const

// VMs with a vNIC on this network. No server-side read exists (NetworkService
// has no vms locator), so useNetworkVms derives membership from the network's
// vNIC profiles + a single GET /vms?follow=nics join — see resources/networks.ts.
export function NetworkVmsTab({ networkId }: { networkId: string }) {
  const t = useT()
  const vms = useNetworkVms(networkId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  const sortedVms = sortRows(vms.data ?? [], sort, (vm, key) =>
    key === 'name' ? vm.name : undefined,
  )

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
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void vms.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {vms.isSuccess && vms.data.length === 0 && <EmptyState titleText={t('viewState.empty')} />}

      {vms.isSuccess && vms.data.length > 0 && (
        <Table aria-label={t('networkDetail.tab.vms')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(NETWORK_VM_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th>{t('common.field.status')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedVms.map((vm) => (
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
