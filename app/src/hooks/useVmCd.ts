import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { changeVmCd, getVmCdromFileId } from '../api/resources/vms'
import { listIsoImages } from '../api/resources/storageDomains'
import type { Vm } from '../api/schemas/vm'
import { useNotify } from '../notifications/context'

// The ISO catalog is shared across VMs and rarely changes mid-session, so a
// generous staleTime avoids refetching it every time the dialog opens. The
// picker still shows a fresh list on a hard reload.
export function useIsoImages(enabled: boolean) {
  return useQuery({
    queryKey: ['isoImages'],
    queryFn: () => listIsoImages(),
    enabled,
    staleTime: 60_000,
  })
}

// The ISO currently in the tray, used to preselect the picker. `current`
// reads the running guest's view; when false it's the persisted next-boot CD.
export function useVmCdrom(vmId: string, current: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['vm', vmId, 'cdrom', current],
    queryFn: () => getVmCdromFileId(vmId, { current }),
    enabled,
  })
}

// Insert/eject an ISO. `current` (running guest vs. next boot) is decided by
// the caller from the VM status. Toasts and invalidates the VM detail + the
// cdrom read so the tray state refreshes.
export function useChangeVmCd() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ vm, fileId, current }: { vm: Vm; fileId: string; current: boolean }) =>
      changeVmCd(vm.id, fileId, { current }),
    onSuccess: (_data, { vm, fileId }) => {
      notify({
        title: fileId === '' ? `CD ejected from ${vm.name}` : `CD changed on ${vm.name}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { vm }) => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vm.id] })
    },
  })
}
