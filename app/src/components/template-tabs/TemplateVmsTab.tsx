import { useVmMembership } from '../../hooks/useVmMembership'
import { VM_NAME_COLUMN, VM_STATUS_COLUMN } from '../vm-membership/columns'
import { VmMembershipTable } from '../vm-membership/VmMembershipTable'

const COLUMNS = [VM_NAME_COLUMN, VM_STATUS_COLUMN]

// The VMs created from this template. There is no template→VM subcollection on
// the engine, so the list comes from the global /vms feed; each VM inlines its
// source template link (vm.template.id), so useVmMembership client-filters to
// this template.
export function TemplateVmsTab({ templateId }: { templateId: string }) {
  const vms = useVmMembership('template', templateId, (vm) => vm.template?.id === templateId)
  return (
    <VmMembershipTable
      query={vms}
      columns={COLUMNS}
      ariaLabel="Virtual machines created from this template"
      emptyBody="No virtual machines have been created from this template."
    />
  )
}
