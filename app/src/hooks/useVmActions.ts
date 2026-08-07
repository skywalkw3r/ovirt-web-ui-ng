import { useMutation, useQueryClient } from '@tanstack/react-query'
import { performVmAction, runOnceVm, type RunOnceSpec, type VmAction } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { en, type MessageId } from '../i18n/messages/en'
import { useNotify } from '../notifications/context'

// Shared by the actions menu and notifications so the wording always matches
// the menu item the user clicked ('stop' reads as "Power off"). Message ids,
// not strings: consuming components resolve them through t()/FormattedMessage
// so the menus follow the active locale (the COLOR_LABEL_IDS pattern).
// NOTE: en.ts also carries action.stop = 'Stop' for the same VmAction — this
// menu deliberately reads 'Power off' (vmActions.stop); reconciling the two
// wordings is the catalog owner's call.
export const VM_ACTION_LABEL_IDS: Record<VmAction, MessageId> = {
  start: 'action.start',
  shutdown: 'vmActions.shutdown',
  stop: 'vmActions.stop',
  reboot: 'action.reboot',
  reset: 'common.action.reset',
  suspend: 'action.suspend',
  cancelmigration: 'vmActions.cancelMigration',
}

// Toast strings are hardcoded English (house convention), so toast builders
// resolve the label ids against the source catalog, never the active locale.
export function vmActionEnglishLabel(action: VmAction): string {
  return en[VM_ACTION_LABEL_IDS[action]]
}

export function useVmAction() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ vm, action }: { vm: Vm; action: VmAction }) => performVmAction(vm.id, action),
    onSuccess: (_data, { vm, action }) => {
      notify({
        title: `${vmActionEnglishLabel(action)} requested for ${vm.name}`,
        variant: 'success',
      })
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
