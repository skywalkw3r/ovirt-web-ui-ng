import { Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem } from '@patternfly/react-core'
import type { Vm } from '../../api/schemas/vm'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { useColumnPrefs, type ColumnDef } from '../../hooks/useColumnPrefs'
import { useVmMembership } from '../../hooks/useVmMembership'
import { formatBytes } from '../../lib/format'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { VM_NAME_COLUMN, VM_STATUS_COLUMN, type VmMembershipColumn } from '../vm-membership/columns'
import { VmMembershipTable } from '../vm-membership/VmMembershipTable'

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Name pinned). Memory/vCPUs are the "consumption" columns that come free on
// the list read (defined memory + topology); live per-VM usage would need the
// statistics subcollection per row, which is not cheap.
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', always: true },
  { key: 'status', label: 'Status' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'memory', label: 'Defined memory' },
  { key: 'vcpus', label: 'vCPUs' },
]

// sockets × cores × threads, absent axes counting as 1 — the same product the
// engine allocates; an absent topology renders an em dash.
function vcpuCount(vm: Vm): string {
  const topology = vm.cpu?.topology
  if (topology === undefined) return '—'
  return String((topology.sockets ?? 1) * (topology.cores ?? 1) * (topology.threads ?? 1))
}

// The VMs consuming this quota. Webadmin's QuotaVmListModel has no REST
// subcollection — the engine serializes each VM's quota as a bare { id } link
// on the global /vms feed (api-model types/VmBase.java `@Link Quota quota()`),
// so useVmMembership client-filters the list. Keyed under ['quota', id, …] so
// a quota edit's prefix invalidation refetches it too.
export function QuotaVmsTab({ quotaId }: { quotaId: string }) {
  const vms = useVmMembership('quota', quotaId, (vm) => vm.quota?.id === quotaId)

  // Cluster-name join: the live /vms feed serializes cluster as a bare { id }
  // link, so names resolve against the cached clusters inventory (the
  // QuotaClusterLimitsTab join, same source).
  const clusters = useClustersInventory()
  const clusterNames = new Map((clusters.data ?? []).map((cluster) => [cluster.id, cluster.name]))

  const prefs = useColumnPrefs('quota-vms', COLUMNS)

  const renderOf: Record<string, VmMembershipColumn['render']> = {
    name: VM_NAME_COLUMN.render,
    status: VM_STATUS_COLUMN.render,
    cluster: (vm) => vm.cluster?.name ?? clusterNames.get(vm.cluster?.id ?? '') ?? '—',
    memory: (vm) => formatBytes(vm.memory),
    vcpus: vcpuCount,
  }

  const visibleColumns: VmMembershipColumn[] = COLUMNS.filter((column) =>
    prefs.isVisible(column.key),
  ).map((column) => ({
    key: column.key,
    label: column.label,
    render: renderOf[column.key] ?? (() => '—'),
  }))

  return (
    <VmMembershipTable
      query={vms}
      columns={visibleColumns}
      ariaLabel="Virtual machines consuming this quota"
      // no CTA: a VM adopts a quota from its own edit dialog / creation flow,
      // not from the quota's side
      emptyBody="No virtual machine consumes this quota."
      resizePrefs={prefs}
      toolbar={
        <Toolbar>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <ColumnPicker
                  columns={COLUMNS}
                  isVisible={prefs.isVisible}
                  onToggle={prefs.toggle}
                  onReset={prefs.reset}
                />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      }
    />
  )
}
