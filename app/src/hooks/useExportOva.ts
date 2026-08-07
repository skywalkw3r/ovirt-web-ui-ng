import { useMutation, useQueryClient } from '@tanstack/react-query'
import { exportVmToOva } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useNotify } from '../notifications/context'

// The Export as OVA modal's mutation. POST /vms/{id}/exporttopathonhost kicks
// an async engine job (packaging the disks into an OVA on the chosen host), so
// the success toast says "Exporting" rather than pretending it finished.
// Invalidates ['jobs'] so the Tasks drawer picks the job up; ['vms'] because a
// running VM briefly snapshots during export.
export function useExportOva() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      vm,
      spec,
    }: {
      vm: Vm
      spec: { hostId: string; directory: string; filename?: string }
    }) => exportVmToOva(vm.id, spec),
    onSuccess: (_data, { vm }) => {
      notify({ title: `Exporting ${vm.name} as OVA`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}
