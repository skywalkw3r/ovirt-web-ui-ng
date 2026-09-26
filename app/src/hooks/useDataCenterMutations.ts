import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  cleanFinishedTasks,
  createDataCenter,
  deleteDataCenter,
  updateDataCenter,
} from '../api/resources/datacenters'
import { useNotify } from '../notifications/context'
import { dataCenterKeys } from './useAdminResources'

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
      void queryClient.invalidateQueries({ queryKey: dataCenterKeys.all })
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
      void queryClient.invalidateQueries({ queryKey: dataCenterKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: dataCenterKeys.all })
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
      void queryClient.invalidateQueries({ queryKey: dataCenterKeys.all })
    },
  })
}

// Force remove (webadmin's separate Force Remove action → DELETE ?force=true)
// removes the data center from the engine's database even when its storage is
// unreachable. Mirrors useDeleteDataCenter otherwise — the detail header's
// typed-name confirm drives it and navigates back to the list on success.
export function useForceDeleteDataCenter() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteDataCenter(id, { force: true }),
    onSuccess: (_data, { name }) => {
      notify({ title: `Data center ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: dataCenterKeys.all })
    },
  })
}

// Clean Finished Tasks (POST .../cleanfinishedtasks) clears the data center's
// completed/aborted async tasks. Non-destructive — it only removes finished
// task records — so the detail kebab fires it with no confirm. On settle the
// data center itself is re-read in case its status reflected a stuck task.
export function useCleanFinishedTasks() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => cleanFinishedTasks(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Finished tasks cleared on ${name}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: dataCenterKeys.detail(id) })
    },
  })
}
