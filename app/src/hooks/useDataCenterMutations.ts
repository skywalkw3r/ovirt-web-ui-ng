import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createDataCenter, deleteDataCenter, updateDataCenter } from '../api/resources/datacenters'
import { useNotify } from '../notifications/context'

// The Create Data Center modal's save mutation. Mirrors useUpdateVm: notify on
// success/failure and invalidate the data center list query so the refetch
// shows the new one. The list key is ['datacenters'] — the key useDataCenters
// registers.
export function useCreateDataCenter() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createDataCenter(payload),
    onSuccess: (dataCenter) => {
      notify({ title: `Data center ${dataCenter.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['datacenters'] })
    },
  })
}

// The Edit Data Center modal's save mutation. Mirrors useUpdateVm: notify on
// success/failure and invalidate the data center detail (['datacenter', id])
// and list (['datacenters']) queries so both refetch and show the edit.
export function useUpdateDataCenter() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateDataCenter(id, payload),
    onSuccess: (dataCenter) => {
      notify({ title: `Changes to ${dataCenter.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['datacenter', id] })
      void queryClient.invalidateQueries({ queryKey: ['datacenters'] })
    },
  })
}

// The data center detail header's Remove mutation. Mirrors useRemoveVm: notify
// on success/failure and invalidate the data center list query so the refetch
// drops the removed one. The caller navigates back to the list on success. The
// list key is ['datacenters'] — the key useDataCenters registers.
export function useDeleteDataCenter() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteDataCenter(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Data center ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['datacenters'] })
    },
  })
}
