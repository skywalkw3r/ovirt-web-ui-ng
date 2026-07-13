import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cloneVm } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { useNotify } from '../notifications/context'

// The Clone VM modal's save mutation. POST /vms/{id}/clone copies the source
// VM's disks into a new VM named `body.name` — the engine honors only the
// name plus the optional target storage domain / discard_snapshots knobs
// riding in `opts` (see cloneVm), so the modal sends nothing else. The
// success toast says "is being created" — the clone rides image_locked while
// the engine copies the disks. Mirrors useCreateTemplate: notify on
// success/failure and invalidate the ['vms'] list prefix (the key every VM
// list query shares) so the list refetches and shows the clone appear and
// settle.
export function useCloneVm() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      vm,
      body,
      opts,
    }: {
      vm: Vm
      body: Record<string, unknown>
      opts?: { storageDomainId?: string; discardSnapshots?: boolean }
    }) => cloneVm(vm.id, body, opts),
    onSuccess: (_data, { vm, body }) => {
      notify({
        title: `Clone ${String(body.name)} is being created from ${vm.name}`,
        variant: 'success',
      })
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
