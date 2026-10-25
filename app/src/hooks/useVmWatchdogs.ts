import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyWatchdogChange,
  listVmWatchdogs,
  type WatchdogChange,
} from '../api/resources/watchdogs'
import { useNotify } from '../notifications/context'

// The VM watchdog slice nests under the VM detail key (['vm', id, <slice>],
// the vmKeys convention) so a VM detail invalidation reaches it by prefix.
export const watchdogKeys = {
  vm: (vmId: string) => ['vm', vmId, 'watchdogs'] as const,
}

// The VM's watchdog devices, read by the Edit VM modal (to seed the draft) and
// its High Availability section (loading/error states). Not polled: device
// config only moves through this console's own edits, which invalidate it.
export function useVmWatchdogs(vmId: string, enabled = true) {
  return useQuery({
    queryKey: watchdogKeys.vm(vmId),
    queryFn: () => listVmWatchdogs(vmId),
    enabled: enabled && vmId !== '',
  })
}

// Reconcile the watchdog device after the Edit VM PUT lands (the device lives
// in the watchdogs subcollection, not the vm PUT body). Success is silent (the
// VM save already toasted); a failure toasts the engine fault verbatim.
export function useApplyVmWatchdog() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ vmId, change }: { vmId: string; vmName?: string; change: WatchdogChange }) =>
      applyWatchdogChange(vmId, change),
    onError: (error, { vmName }) => {
      notify({
        title: `Watchdog change on ${vmName ?? 'the VM'} failed: ${error.message}`,
        variant: 'danger',
      })
    },
    onSettled: (_data, _error, { vmId }) => {
      void queryClient.invalidateQueries({ queryKey: watchdogKeys.vm(vmId) })
    },
  })
}
