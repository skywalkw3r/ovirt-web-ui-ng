import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createInstanceType,
  deleteInstanceType,
  updateInstanceType,
} from '../api/resources/instanceTypes'
import { useNotify } from '../notifications/context'
import { instanceTypeKeys } from './useCatalogPages'

// The Create Instance Type modal's save mutation. Mirrors useCreateCluster:
// notify on success/failure and invalidate the instance type list query so the
// refetch shows the new one. The list key is ['instancetypes'] — the key
// useInstanceTypes registers.
//
// `followUp` is a PUT applied to the new instance type right after the POST,
// for fields the engine's add path ignores (USB: BackendInstanceTypesResource
// .add never reads it, only update does). If that PUT fails, the instance type
// exists without it and the error toast says why.
export function useCreateInstanceType() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: async ({
      payload,
      followUp,
    }: {
      payload: Record<string, unknown>
      followUp?: Record<string, unknown>
    }) => {
      const created = await createInstanceType(payload)
      return followUp ? updateInstanceType(created.id, followUp) : created
    },
    onSuccess: (instanceType) => {
      notify({ title: `Instance type ${instanceType.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: instanceTypeKeys.all })
    },
  })
}

// The Edit Instance Type modal's save mutation. Mirrors useUpdateCluster: notify
// on success/failure and invalidate both the detail (['instancetype', id]) and
// list (['instancetypes']) queries so both refetch and show the edit.
export function useUpdateInstanceType() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateInstanceType(id, payload),
    onSuccess: (instanceType) => {
      notify({ title: `Changes to ${instanceType.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: instanceTypeKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: instanceTypeKeys.all })
    },
  })
}

// The Remove Instance Type mutation. Mirrors useDeleteCluster: notify on
// success/failure and invalidate the list query so the refetch drops the removed
// one. Takes { id, name } so the success toast can name the type. The engine has
// no in-use precondition here (dependent VMs flip to a custom configuration), so
// there is no 409 path to surface. The list key is ['instancetypes'].
export function useDeleteInstanceType() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteInstanceType(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Instance type ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: instanceTypeKeys.all })
    },
  })
}
