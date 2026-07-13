import { useMutation, useQueryClient } from '@tanstack/react-query'
import { migrateVm, performVmAction, type VmAction } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useNotify } from '../notifications/context'
import { VM_ACTION_LABELS } from './useVmActions'

// Build the single aggregate toast for a fanned-out bulk operation. verb reads
// as the past-tense request wording ("Shutdown requested", "Migration
// requested"); allSettled preserves input order so results[i] pairs with vms[i].
function notifyBulkResult(
  notify: ReturnType<typeof useNotify>['notify'],
  verb: string,
  vms: Vm[],
  results: PromiseSettledResult<unknown>[],
): void {
  const failedNames = vms
    .filter((_vm, index) => results[index].status === 'rejected')
    .map((vm) => vm.name)
  const succeeded = vms.length - failedNames.length

  if (failedNames.length === 0) {
    notify({
      title: `${verb} requested for ${vms.length} VM${vms.length === 1 ? '' : 's'}`,
      variant: 'success',
    })
  } else {
    notify({
      title: `${succeeded} succeeded, ${failedNames.length} failed: ${failedNames.join(', ')}`,
      variant: succeeded > 0 ? 'warning' : 'danger',
    })
  }
}

// Bulk lifecycle actions fan out one request per VM but report as a single
// operation: Promise.allSettled (never rejects, so partial failure still
// reaches onSuccess), ONE aggregate toast instead of a toast per VM, and one
// ['vms'] invalidation instead of one per settled request. runMigrate follows
// the same shape for a fanned-out live migration (optional pinned host).
export function useBulkVmAction(): {
  run: (vms: Vm[], action: VmAction) => void
  runMigrate: (vms: Vm[], hostId?: string) => void
  pending: boolean
} {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['vms'] })

  const actionMutation = useMutation({
    mutationFn: async ({ vms, action }: { vms: Vm[]; action: VmAction }) =>
      Promise.allSettled(vms.map((vm) => performVmAction(vm.id, action))),
    onSuccess: (results, { vms, action }) =>
      notifyBulkResult(notify, VM_ACTION_LABELS[action], vms, results),
    onSettled: invalidate,
  })

  const migrateMutation = useMutation({
    mutationFn: async ({ vms, hostId }: { vms: Vm[]; hostId?: string }) =>
      Promise.allSettled(vms.map((vm) => migrateVm(vm.id, { hostId }))),
    onSuccess: (results, { vms }) => notifyBulkResult(notify, 'Migration', vms, results),
    onSettled: invalidate,
  })

  return {
    run: (vms, action) => {
      if (vms.length === 0) return
      actionMutation.mutate({ vms, action })
    },
    runMigrate: (vms, hostId) => {
      if (vms.length === 0) return
      migrateMutation.mutate({ vms, hostId })
    },
    pending: actionMutation.isPending || migrateMutation.isPending,
  }
}
