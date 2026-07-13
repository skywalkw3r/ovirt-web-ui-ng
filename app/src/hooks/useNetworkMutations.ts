import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNetwork, deleteNetwork, updateNetwork } from '../api/resources/networks'
import { useNotify } from '../notifications/context'

// The Create Network modal's save mutation. Mirrors useCreateDataCenter: notify
// on success/failure and invalidate the network list query so the refetch shows
// the new one. The list key is ['networks'] — the key useNetworks registers.
export function useCreateNetwork() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createNetwork(payload),
    onSuccess: (network) => {
      notify({ title: `Network ${network.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
  })
}

// The Edit Network modal's save mutation. Mirrors useUpdateDataCenter: notify on
// success/failure and invalidate the network detail (['network', id] — the key
// useNetwork registers) and list (['networks']) queries so both refetch and
// show the edit.
export function useUpdateNetwork() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateNetwork(id, payload),
    onSuccess: (network) => {
      notify({ title: `Changes to ${network.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['network', id] })
      void queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
  })
}

// The network detail header's Remove mutation. Mirrors useRemoveVm: notify on
// success/failure and invalidate the network list query so the refetch drops
// the removed one. The caller navigates back to the list on success. The list
// key is ['networks'] — the key useNetworks registers.
export function useDeleteNetwork() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteNetwork(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Network ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
  })
}
