import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useHostVms } from '../../hooks/useHostDetail'
import { VmStatusLabel } from '../VmStatusLabel'

// Every column in visual order so each Th's index matches its position; Status
// stays unsortable — it is a state chip, not a scannable value.
const HOST_VM_KEYS = ['name', 'status', 'fqdn'] as const

// The VMs currently running on this host. There is no host→VM subcollection on
// the engine, so the list comes from the global /vms feed narrowed with the
// search DSL (host.name=<name>) in useHostVms.
export function HostVmsTab({ hostName }: { hostName: string }) {
  const vms = useHostVms(hostName)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort). Before the early returns so
  // hook order stays stable.
  const { sort, thSort } = useColumnSort()

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

  // fqdn is guest-agent reported: absent (or blank) on VMs without one, so it
  // sorts as undefined and those rows sink to the end rather than leading with
  // em dashes.
  const sortedVms = sortRows(vms.data, sort, (vm, key) =>
    key === 'name' ? vm.name : key === 'fqdn' ? vm.fqdn || undefined : undefined,
  )

  return (
    <Table aria-label="Virtual machines on this host" variant="compact">
      <Thead>
        <Tr>
          <Th sort={thSort(HOST_VM_KEYS, 0)}>Name</Th>
          <Th>Status</Th>
          <Th sort={thSort(HOST_VM_KEYS, 2)}>FQDN</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sortedVms.map((vm) => (
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
