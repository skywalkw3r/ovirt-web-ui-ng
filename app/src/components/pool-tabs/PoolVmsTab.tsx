import type { Vm } from '../../api/schemas/vm'
import { useVmMembership } from '../../hooks/useVmMembership'
import { useT } from '../../i18n/useT'
import { VM_NAME_COLUMN, VM_STATUS_COLUMN } from '../vm-membership/columns'
import { VmMembershipTable } from '../vm-membership/VmMembershipTable'

// The VmPool REST service exposes no `vms` subcollection (VmPoolService has only
// permissions()), so pool membership comes from the global /vms feed: each Vm
// inlines its `vm_pool` link (Vm.vmPool), and useVmMembership client-filters to
// this pool.
function poolIdOf(vm: Vm): string | undefined {
  return vm.vm_pool?.id
}

const COLUMNS = [VM_NAME_COLUMN, VM_STATUS_COLUMN]

export function PoolVmsTab({ poolId }: { poolId: string }) {
  const t = useT()
  const vms = useVmMembership('pool', poolId, (vm) => poolIdOf(vm) === poolId)
  return (
    <VmMembershipTable
      query={vms}
      columns={COLUMNS}
      ariaLabel={t('poolVms.table.ariaLabel')}
      emptyBody={t('poolVms.empty.body')}
    />
  )
}
