import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { VmStatusLabel } from '../VmStatusLabel'
import { useVnicProfileVms } from './useVnicProfileDetail'

// VMs with a vNIC bound to this profile. No server-side read exists (the
// api-model offers no vms locator on a vNIC profile), so useVnicProfileVms
// derives membership from a single GET /vms?follow=nics join — see
// resources/vnicProfiles.ts.
export function VnicProfileVmsTab({ profileId }: { profileId: string }) {
  const vms = useVnicProfileVms(profileId)

  return (
    <>
      {vms.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading virtual machines" />
        </>
      )}

      {vms.isError && (
        <EmptyState titleText="Could not load virtual machines" status="danger">
          <EmptyStateBody>
            {vms.error instanceof Error ? vms.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void vms.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {vms.isSuccess && vms.data.length === 0 && (
        <EmptyState titleText="No virtual machines">
          <EmptyStateBody>No virtual machine uses this vNIC profile.</EmptyStateBody>
        </EmptyState>
      )}

      {vms.isSuccess && vms.data.length > 0 && (
        <Table aria-label="Virtual machines using this vNIC profile" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {vms.data.map((vm) => (
              <Tr key={vm.id}>
                <Td dataLabel="Name">
                  <Link to="/vms/$vmId" params={{ vmId: vm.id }}>
                    {vm.name}
                  </Link>
                </Td>
                <Td dataLabel="Status">
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
