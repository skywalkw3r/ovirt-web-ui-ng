import { useMemo } from 'react'
import { Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem } from '@patternfly/react-core'
import type { Vm } from '../../api/schemas/vm'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { useColumnPrefs } from '../../hooks/useColumnPrefs'
import { useVmMembership } from '../../hooks/useVmMembership'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { formatBytes } from '../../lib/format'
import { ColumnPicker } from '../list-toolbar/ColumnPicker'
import { VM_NAME_COLUMN, VM_STATUS_COLUMN, type VmMembershipColumn } from '../vm-membership/columns'
import { VmMembershipTable } from '../vm-membership/VmMembershipTable'

interface QuotaVmColumn {
  key: string
  labelId: MessageId
  always?: boolean
}

// >4 columns ⇒ the COLUMNS + useColumnPrefs + ColumnPicker house pattern
// (Name pinned). Labels are message ids resolved per-locale in the component
// (the HostDevicesTab idiom). Memory/vCPUs are the "consumption" columns that
// come free on the list read (defined memory + topology); live per-VM usage
// would need the statistics subcollection per row, which is not cheap.
const COLUMNS: QuotaVmColumn[] = [
  { key: 'name', labelId: 'common.field.name', always: true },
  { key: 'status', labelId: 'common.field.status' },
  { key: 'cluster', labelId: 'common.field.cluster' },
  { key: 'memory', labelId: 'quotaVms.column.definedMemory' },
  { key: 'vcpus', labelId: 'quota.limits.vcpus' },
]

// sockets × cores × threads, absent axes counting as 1 — the same product the
// engine allocates. Split from the cell so the column sorts numerically rather
// than lexically on the rendered string; an absent topology sinks (undefined)
// and still renders an em dash.
function vcpuValue(vm: Vm): number | undefined {
  const topology = vm.cpu?.topology
  if (topology === undefined) return undefined
  return (topology.sockets ?? 1) * (topology.cores ?? 1) * (topology.threads ?? 1)
}

function vcpuCount(vm: Vm): string {
  const value = vcpuValue(vm)
  return value === undefined ? '—' : String(value)
}

// The VMs consuming this quota. Webadmin's QuotaVmListModel has no REST
// subcollection — the engine serializes each VM's quota as a bare { id } link
// on the global /vms feed (api-model types/VmBase.java `@Link Quota quota()`),
// so useVmMembership client-filters the list. Keyed under ['quota', id, …] so
// a quota edit's prefix invalidation refetches it too.
export function QuotaVmsTab({ quotaId }: { quotaId: string }) {
  const t = useT()
  const vms = useVmMembership('quota', quotaId, (vm) => vm.quota?.id === quotaId)

  // Cluster-name join: the live /vms feed serializes cluster as a bare { id }
  // link, so names resolve against the cached clusters inventory (the
  // QuotaClusterLimitsTab join, same source).
  const clusters = useClustersInventory()
  const clusterNames = new Map((clusters.data ?? []).map((cluster) => [cluster.id, cluster.name]))

  // Resolve column labels for the active locale; identity is stable per locale
  // (t is memoized on intl) so useColumnPrefs' seeding stays sound.
  const columns = useMemo(
    () => COLUMNS.map((column) => ({ ...column, label: t(column.labelId) })),
    [t],
  )
  const prefs = useColumnPrefs('quota-vms', columns)

  const renderOf: Record<string, VmMembershipColumn['render']> = {
    name: VM_NAME_COLUMN.render,
    status: VM_STATUS_COLUMN.render,
    cluster: (vm) => vm.cluster?.name ?? clusterNames.get(vm.cluster?.id ?? '') ?? '—',
    memory: (vm) => formatBytes(vm.memory),
    vcpus: vcpuCount,
  }

  // Mirrors renderOf, but yields the COMPARABLE value (raw bytes, the vCPU
  // product) rather than the formatted cell, and undefined — not an em dash —
  // for absent values so they sink. Status is deliberately absent: a state chip
  // is not a scannable value (same rule as the list pages).
  const sortOf: Record<string, VmMembershipColumn['sortValue']> = {
    name: VM_NAME_COLUMN.sortValue,
    cluster: (vm) => vm.cluster?.name ?? clusterNames.get(vm.cluster?.id ?? '') ?? undefined,
    memory: (vm) => vm.memory,
    vcpus: vcpuValue,
  }

  const visibleColumns: VmMembershipColumn[] = columns
    .filter((column) => prefs.isVisible(column.key))
    .map((column) => ({
      key: column.key,
      label: column.label,
      render: renderOf[column.key] ?? (() => '—'),
      sortValue: sortOf[column.key],
    }))

  return (
    <VmMembershipTable
      query={vms}
      columns={visibleColumns}
      ariaLabel={t('quotaVms.table.ariaLabel')}
      // no CTA: a VM adopts a quota from its own edit dialog / creation flow,
      // not from the quota's side
      emptyBody={t('quotaVms.empty.body')}
      resizePrefs={prefs}
      toolbar={
        <Toolbar>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <ColumnPicker
                  columns={columns}
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
