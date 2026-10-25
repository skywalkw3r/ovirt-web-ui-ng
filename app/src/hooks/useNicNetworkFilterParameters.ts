import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyNetworkFilterParameterPlan,
  listNicNetworkFilterParameters,
  type NetworkFilterParameterPlan,
} from '../api/resources/nicNetworkFilterParameters'
import { listVmNics } from '../api/resources/nics'
import type { Nic } from '../api/schemas/nic'

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

// A failed parameter apply. `nic` is the NIC the plan targeted when it was
// resolved by name (the Add flow), so the caller can switch its dialog to
// editing that NIC instead of offering to create it again.
export class NicFilterParametersError extends Error {
  readonly nic?: Nic

  constructor(message: string, nic?: Nic) {
    super(message)
    this.name = 'NicFilterParametersError'
    this.nic = nic
  }
}

// Apply a parameter plan to a vNIC. On Add the dialog only knows the new NIC's
// name (POST /nics answers through a void resource call), so the NIC resolves
// by name from a fresh NIC list; names are unique per VM (the engine rejects a
// duplicate). Silent both ways: the NIC mutation toasts the save, and the NIC
// dialog reports a parameter failure inline (a toast would double-report it).
export function useApplyNicNetworkFilterParameters(vmId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      nicId,
      nicName,
      plan,
    }: {
      nicId?: string
      nicName: string
      plan: NetworkFilterParameterPlan
    }): Promise<string> => {
      let resolved: Nic | undefined
      if (nicId === undefined) {
        resolved = (await listVmNics(vmId)).find((nic) => nic.name === nicName)
        if (resolved === undefined) {
          throw new NicFilterParametersError(`network interface ${nicName} not found`)
        }
      }
      const id = nicId ?? resolved!.id
      try {
        await applyNetworkFilterParameterPlan(vmId, id, plan)
      } catch (error) {
        throw new NicFilterParametersError(
          error instanceof Error ? error.message : String(error),
          resolved,
        )
      }
      return id
    },
    // A partly applied plan still moved the engine, so refresh on failure too.
    onSettled: (resolvedId, error, { nicId }) => {
      const target =
        resolvedId ??
        nicId ??
        (error instanceof NicFilterParametersError ? error.nic?.id : undefined)
      if (target !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: nicNetworkFilterParameterKeys.nic(vmId, target),
        })
      }
    },
  })
}
