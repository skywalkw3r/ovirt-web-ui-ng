import { useMemo } from 'react'
import { useVmMembership } from '../../hooks/useVmMembership'
import { VM_NAME_COLUMN, VM_STATUS_COLUMN, type VmMembershipColumn } from '../vm-membership/columns'
import { VmMembershipTable } from '../vm-membership/VmMembershipTable'
import { useT } from '../../i18n/useT'

// The VMs running in this cluster: the global /vms feed inlines each VM's
// cluster link (vm.cluster.id), so useVmMembership client-filters to this
// cluster.
export function ClusterVmsTab({ clusterId }: { clusterId: string }) {
  const t = useT()
  const vms = useVmMembership('cluster', clusterId, (vm) => vm.cluster?.id === clusterId)
  const columns: VmMembershipColumn[] = useMemo(
    () => [
      { ...VM_NAME_COLUMN, width: 30 },
      { ...VM_STATUS_COLUMN, width: 15 },
      {
        // description with comment fallback — single line, full text on hover
        // (mirrors ClusterHostsTab)
        key: 'description',
        label: t('common.field.description'),
        sortValue: (vm) => vm.description ?? vm.comment ?? undefined,
        modifier: 'truncate',
        title: (vm) => vm.description ?? vm.comment ?? undefined,
        render: (vm) => vm.description ?? vm.comment ?? '—',
      },
    ],
    [t],
  )
  return (
    <VmMembershipTable
      query={vms}
      columns={columns}
      ariaLabel={t('clusterVms.table.ariaLabel')}
      emptyBody={t('clusterVms.empty.body')}
    />
  )
}
