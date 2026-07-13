import { useMutation, useQueryClient } from '@tanstack/react-query'
import { performVmAction, runOnceVm, type RunOnceSpec, type VmAction } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useNotify } from '../notifications/context'

// Shared by the actions menu and notifications so the toast wording always
// matches the menu item the user clicked ('stop' reads as "Power off").
export const VM_ACTION_LABELS: Record<VmAction, string> = {
  start: 'Start',
  shutdown: 'Shutdown',
  stop: 'Power off',
  reboot: 'Reboot',
  reset: 'Reset',
  suspend: 'Suspend',
  cancelmigration: 'Cancel migration',
}

export function useVmAction() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ vm, action }: { vm: Vm; action: VmAction }) => performVmAction(vm.id, action),
    onSuccess: (_data, { vm, action }) => {
      notify({ title: `${VM_ACTION_LABELS[action]} requested for ${vm.name}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { vm }) => {
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
      void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
    },
  })
}

// Run Once (start with a one-shot run config). Separate from useVmAction
// because the body carries the run overrides; the toast reads "started".
export function useRunOnceVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ vm, spec }: { vm: Vm; spec: RunOnceSpec }) => runOnceVm(vm.id, spec),
    onSuccess: (_data, { vm }) => {
      notify({ title: `Run Once started for ${vm.name}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { vm }) => {
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
      void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
    },
  })
}
