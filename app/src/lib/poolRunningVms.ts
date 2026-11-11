import type { Vm } from '../api/schemas/vm'

// The engine's vm_pools_full_view counts a pool VM as running unless its
// vm_dynamic status is Down (0) or ImageLocked (15) — webadmin's Running VMs
// column reads that count, which VmPoolMapper never maps onto the REST
// VmPool. The Pools grid recomputes it from the /vms list instead (each Vm
// carries its vm_pool link), with the same predicate.
const NOT_RUNNING_STATUSES = new Set(['down', 'image_locked'])

// pool id → running member count; pools with no running member are absent
export function runningVmCounts(vms: readonly Vm[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const vm of vms) {
    const poolId = vm.vm_pool?.id
    if (poolId === undefined || NOT_RUNNING_STATUSES.has(vm.status ?? 'down')) continue
    counts.set(poolId, (counts.get(poolId) ?? 0) + 1)
  }
  return counts
}
