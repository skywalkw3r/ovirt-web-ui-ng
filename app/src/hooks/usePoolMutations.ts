import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPool, deletePool, updatePool } from '../api/resources/pools'
import { useNotify } from '../notifications/context'

// The Create Pool modal's save mutation. Mirrors useCreateCluster: notify on
// success/failure and invalidate the pool list query so the refetch shows the
// new one. The list key is ['pools'] — the key usePools registers.
export function useCreatePool() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createPool(payload),
    onSuccess: (pool) => {
      notify({ title: `Pool ${pool.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['pools'] })
    },
  })
}

// The Edit Pool modal's save mutation. Mirrors useUpdateCluster: notify on
// success/failure and invalidate the pool list query (['pools']) so the refetch
// shows the edit.
export function useUpdatePool() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updatePool(id, payload),
    onSuccess: (pool) => {
      notify({ title: `Changes to ${pool.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['pools'] })
    },
  })
}

// The pool row's Remove mutation. Mirrors useDeleteCluster: notify on
// success/failure and invalidate the pool list query so the refetch drops the
// removed one. Takes { id, name } — the id drives the request, the name the
// success toast. The list key is ['pools'] — the key usePools registers.
export function useDeletePool() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deletePool(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Pool ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['pools'] })
    },
  })
}
