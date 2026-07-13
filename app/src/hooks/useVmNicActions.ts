import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addVmNic,
  removeVmNic,
  updateVmNic,
  type NewNicSpec,
  type NicPatch,
} from '../api/resources/nics'
import type { Nic } from '../api/schemas/nic'
import { useNotify } from '../notifications/context'

// NIC names are optional on the wire — toasts and modal titles fall back to
// the id so the user always sees something identifying.
export function nicLabel(nic: Nic): string {
  return nic.name ?? nic.id
}

// Toast wording mirrors useVmActions/useSnapshots: acknowledge what happened,
// ApiError.message carries the engine fault detail verbatim on failure.
export function useAddVmNic(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: NewNicSpec) => addVmNic(vmId, spec),
    onSuccess: (_data, spec) => {
      notify({ title: `Network interface ${spec.name} added`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'nics'] })
    },
  })
}

// Takes the whole Nic (not just the id) so the toast can name what changed.
export function useUpdateVmNic(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ nic, patch }: { nic: Nic; patch: NicPatch }) => updateVmNic(vmId, nic.id, patch),
    onSuccess: (_data, { nic, patch }) => {
      // plug toggles get action wording; profile/link edits read as an update
      const title =
        patch.plugged === undefined
          ? `Network interface ${nicLabel(nic)} updated`
          : `Network interface ${nicLabel(nic)} ${patch.plugged ? 'plugged' : 'unplugged'}`
      notify({ title, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'nics'] })
    },
  })
}

export function useRemoveVmNic(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (nic: Nic) => removeVmNic(vmId, nic.id),
    onSuccess: (_data, nic) => {
      notify({ title: `Network interface ${nicLabel(nic)} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'nics'] })
    },
  })
}
