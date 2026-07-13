import type { Vm } from '../../api/schemas/vm'
import { useVmMembership } from '../../hooks/useVmMembership'
import { VM_NAME_COLUMN, VM_STATUS_COLUMN } from '../vm-membership/columns'
import { VmMembershipTable } from '../vm-membership/VmMembershipTable'

// The VmPool REST service exposes no `vms` subcollection (VmPoolService has only
// permissions()), so pool membership comes from the global /vms feed: each Vm
// inlines its `vm_pool` link (Vm.vmPool), and useVmMembership client-filters to
// this pool. VmSchema is a passthrough looseObject and does not type `vm_pool`,
// so the membership read is a narrow local cast.
function poolIdOf(vm: Vm): string | undefined {
  return (vm as { vm_pool?: { id?: string } }).vm_pool?.id
}

const COLUMNS = [VM_NAME_COLUMN, VM_STATUS_COLUMN]

export function PoolVmsTab({ poolId }: { poolId: string }) {
  const vms = useVmMembership('pool', poolId, (vm) => poolIdOf(vm) === poolId)
  return (
    <VmMembershipTable
      query={vms}
      columns={COLUMNS}
      ariaLabel="Virtual machines in this pool"
      emptyBody="This pool has no member virtual machines."
    />
  )
}
