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
import { VmStatusLabel } from '../VmStatusLabel'
import { useT } from '../../i18n/useT'
import { useVnicProfileVms } from './useVnicProfileDetail'

// VMs with a vNIC bound to this profile. No server-side read exists (the
// api-model offers no vms locator on a vNIC profile), so useVnicProfileVms
// derives membership from a single GET /vms?follow=nics join — see
// resources/vnicProfiles.ts.
export function VnicProfileVmsTab({ profileId }: { profileId: string }) {
  const t = useT()
  const vms = useVnicProfileVms(profileId)

  return (
    <>
      {vms.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('vms.loading')} />
        </>
      )}

      {vms.isError && (
        <EmptyState titleText={t('vms.error.title')} status="danger">
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

      {vms.isSuccess && vms.data.length === 0 && (
        <EmptyState titleText={t('vms.empty.title')}>
          <EmptyStateBody>{t('vnicProfileDetail.vms.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {vms.isSuccess && vms.data.length > 0 && (
        <Table aria-label={t('vnicProfileDetail.vms.table.ariaLabel')} variant="compact">
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
