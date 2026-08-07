import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateVm } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useNotify } from '../notifications/context'

// The Edit Virtual Machine modal's save mutation. Mirrors useVmAction: notify
// on success/failure, invalidate the VM detail and list queries so the refetch
// shows the edit. Takes the whole Vm (not just the id) so the toast can name
// what changed and the invalidation targets ['vm', id].
export function useUpdateVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      vm,
      payload,
      nextRun,
    }: {
      vm: Vm
      payload: Record<string, unknown>
      // When true, PUT ?next_run=true so the engine stages the edit for the
      // next boot rather than hot-applying it (the Next-Run dialog's "Apply
      // after restart" choice).
      nextRun?: boolean
    }) => updateVm(vm.id, payload, { nextRun }),
    onSuccess: (_data, { vm }) => {
      notify({ title: `Changes to ${vm.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { vm }) => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
