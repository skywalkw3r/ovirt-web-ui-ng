import { useVmMembership } from '../../hooks/useVmMembership'
import { VM_NAME_COLUMN, VM_STATUS_COLUMN, type VmMembershipColumn } from '../vm-membership/columns'
import { VmMembershipTable } from '../vm-membership/VmMembershipTable'

const COLUMNS: VmMembershipColumn[] = [
  { ...VM_NAME_COLUMN, width: 30 },
  { ...VM_STATUS_COLUMN, width: 15 },
  {
    // description with comment fallback — single line, full text on hover
    // (mirrors ClusterHostsTab)
    key: 'description',
    label: 'Description',
    modifier: 'truncate',
    title: (vm) => vm.description ?? vm.comment ?? undefined,
    render: (vm) => vm.description ?? vm.comment ?? '—',
  },
]

// The VMs running in this cluster: the global /vms feed inlines each VM's
// cluster link (vm.cluster.id), so useVmMembership client-filters to this
// cluster.
export function ClusterVmsTab({ clusterId }: { clusterId: string }) {
  const vms = useVmMembership('cluster', clusterId, (vm) => vm.cluster?.id === clusterId)
  return (
    <VmMembershipTable
      query={vms}
      columns={COLUMNS}
      ariaLabel="Virtual machines in this cluster"
      emptyBody="No virtual machines are running in this cluster."
    />
  )
}
