import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useHostVms } from '../../hooks/useHostDetail'
import { VmStatusLabel } from '../VmStatusLabel'

// The VMs currently running on this host. There is no host→VM subcollection on
// the engine, so the list comes from the global /vms feed narrowed with the
// search DSL (host.name=<name>) in useHostVms.
export function HostVmsTab({ hostName }: { hostName: string }) {
  const vms = useHostVms(hostName)

  if (vms.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText="Loading virtual machines" />
      </>
    )
  }

  if (vms.isError) {
    return (
      <EmptyState titleText="Could not load virtual machines" status="danger">
        <EmptyStateBody>
          {vms.error instanceof Error ? vms.error.message : 'Unknown error'}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void vms.refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  if (vms.data.length === 0) {
    return (
      <EmptyState titleText="No virtual machines">
        <EmptyStateBody>No virtual machines are running on this host.</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label="Virtual machines on this host" variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Status</Th>
          <Th>FQDN</Th>
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
            <Td dataLabel="FQDN">{vm.fqdn ?? '—'}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
