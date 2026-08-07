import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createMacPool,
  deleteMacPool,
  listMacPools,
  updateMacPool,
} from '../api/resources/macPools'
import { useCapabilities } from '../auth/capabilities'
import { useNotify } from '../notifications/context'
import { useAdminResourcePollInterval } from './useAdminResources'

// MAC address pools are an engine-global admin collection — near-static
// inventory, so the list shares the 60s-floor cadence of the other admin
// collections (useAdminResourcePollInterval) and skips the doomed request for
// user-tier accounts (MacPoolsPage renders <NotPermitted> instead). Gating on
// isAdmin alone is safe: it stays false until the profile has loaded. The list
// key is ['macpools'] — the same key the cluster form's MAC Pool select query
// already registers, so a pool created here also refreshes that select.
export function useMacPools() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['macpools'],
    queryFn: () => listMacPools(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// The three mutations invalidate ['macpools'] so the list refetches after a
// write. MAC pools are admin-only server-side; MacPoolsPage already gates the
// whole route behind loaded && isAdmin, so these mutations don't re-gate.

// The New MAC pool modal's save mutation.
export function useCreateMacPool() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => createMacPool(body),
    onSuccess: (pool) => {
      notify({ title: `MAC pool ${pool.name ?? ''} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (name
      // required, duplicate name, malformed/overlapping range)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['macpools'] })
    },
  })
}

// The Edit MAC pool modal's save mutation.
export function useUpdateMacPool() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateMacPool(id, body),
    onSuccess: (pool) => {
      notify({ title: `Changes to ${pool.name ?? ''} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['macpools'] })
    },
  })
}

// The MacPoolsPage per-row Remove mutation. The built-in Default pool is not
// offered a Remove (the engine 409s it); this is only reached for user-created
// pools. A pool still assigned to a cluster is rejected with a 409 that surfaces
// verbatim via ApiError. Takes { id, name } so the success toast can name it.
export function useDeleteMacPool() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name?: string }) => deleteMacPool(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `MAC pool ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['macpools'] })
    },
  })
}
