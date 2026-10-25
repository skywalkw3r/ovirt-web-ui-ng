import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyWatchdogChange,
  listTemplateWatchdogs,
  listVmWatchdogs,
  reconcileVmWatchdog,
  type WatchdogChange,
  type WatchdogSpec,
} from '../api/resources/watchdogs'
import { useNotify } from '../notifications/context'

// The VM watchdog slice nests under the VM detail key (['vm', id, <slice>],
// the vmKeys convention) so a VM detail invalidation reaches it by prefix.
// The template slice nests under the template detail key the same way
// (templateKeys.detail = ['template', id]).
export const watchdogKeys = {
  vm: (vmId: string) => ['vm', vmId, 'watchdogs'] as const,
  template: (templateId: string) => ['template', templateId, 'watchdogs'] as const,
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
// in the watchdogs subcollection, not the vm PUT body). Silent both ways: the
// VM save toasts success, and the Edit VM modal reports a failure inline
// (a toast here would report the same fault twice).
export function useApplyVmWatchdog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ vmId, change }: { vmId: string; change: WatchdogChange }) =>
      applyWatchdogChange(vmId, change),
    onSettled: (_data, _error, { vmId }) => {
      void queryClient.invalidateQueries({ queryKey: watchdogKeys.vm(vmId) })
    },
  })
}

// The selected template's watchdog, which the New VM wizard seeds its fields
// from (a VM created from the template inherits the device).
export function useTemplateWatchdogs(templateId: string | undefined) {
  return useQuery({
    queryKey: watchdogKeys.template(templateId ?? ''),
    queryFn: () => listTemplateWatchdogs(templateId ?? ''),
    enabled: templateId !== undefined && templateId !== '',
  })
}

// The New VM wizard's post-create step: bring the new VM's watchdog to the
// chosen state (it may carry one inherited from the template). The VM already
// exists, so a failure never rolls it back; it toasts that the VM was created
// without the requested watchdog setting, the way the wizard reports its
// other outcomes (useCreateVm toasts).
export function useReconcileVmWatchdog() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ vmId, desired }: { vmId: string; vmName: string; desired: WatchdogSpec }) =>
      reconcileVmWatchdog(vmId, desired),
    onError: (error, { vmName }) => {
      notify({
        title: `Virtual machine ${vmName} was created without the requested watchdog setting: ${error.message}`,
        variant: 'danger',
      })
    },
    onSettled: (_data, _error, { vmId }) => {
      void queryClient.invalidateQueries({ queryKey: watchdogKeys.vm(vmId) })
    },
  })
}
