import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyNetworkFilterParameterPlan,
  listNicNetworkFilterParameters,
  type NetworkFilterParameterPlan,
} from '../api/resources/nicNetworkFilterParameters'
import { listVmNics } from '../api/resources/nics'
import { useNotify } from '../notifications/context'

// Nested under the VM NICs key (['vm', id, 'nics', ...], like
// vmKeys.nicStatistics) so every NIC add/edit/remove invalidation reaches the
// parameter reads by prefix too.
export const nicNetworkFilterParameterKeys = {
  nic: (vmId: string, nicId: string) =>
    ['vm', vmId, 'nics', nicId, 'networkFilterParameters'] as const,
}

// The parameters of one VM vNIC, read by the Edit Network Interface dialog.
export function useNicNetworkFilterParameters(vmId: string, nicId: string, enabled = true) {
  return useQuery({
    queryKey: nicNetworkFilterParameterKeys.nic(vmId, nicId),
    queryFn: () => listNicNetworkFilterParameters(vmId, nicId),
    enabled: enabled && vmId !== '' && nicId !== '',
  })
}

// Apply a parameter plan to a vNIC. On Add the dialog only knows the new NIC's
// name (POST /nics answers through a void resource call), so the id resolves by
// name from a fresh NIC list; names are unique per VM (the engine rejects a
// duplicate). Success is silent (the NIC mutation already toasted); a failure
// toasts the engine fault verbatim.
export function useApplyNicNetworkFilterParameters(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: async ({
      nicId,
      nicName,
      plan,
    }: {
      nicId?: string
      nicName: string
      plan: NetworkFilterParameterPlan
    }) => {
      const id = nicId ?? (await listVmNics(vmId)).find((nic) => nic.name === nicName)?.id
      if (id === undefined) throw new Error(`network interface ${nicName} not found`)
      await applyNetworkFilterParameterPlan(vmId, id, plan)
      return id
    },
    onError: (error, { nicName }) => {
      notify({
        title: `Network filter parameters on ${nicName} not saved: ${error.message}`,
        variant: 'danger',
      })
    },
    onSettled: (nicId) => {
      if (nicId !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: nicNetworkFilterParameterKeys.nic(vmId, nicId),
        })
      }
    },
  })
}
