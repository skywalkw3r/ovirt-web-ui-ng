import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createVm, type NewVmSpec } from '../api/resources/vms'
import { useNotify } from '../notifications/context'

// The engine echoes the created VM back, so the mutation data carries the new
// id — callers navigate to its details page from their own onSuccess.
export function useCreateVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: NewVmSpec) => createVm(spec),
    onSuccess: (vm) => {
      notify({ title: `Virtual machine ${vm.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
