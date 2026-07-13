import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createDataCenterQos,
  deleteDataCenterQos,
  updateDataCenterQos,
} from '../api/resources/datacenters'
import { useNotify } from '../notifications/context'

// Every QoS mutation invalidates the two keys the QoS lists hang off so newly
// authored/edited/removed profiles appear immediately in both the DC QoS tab
// and the pickers that consume them:
//   ['datacenter', dcId, 'qoss']  — useDataCenterQoss + the network form picker
//   ['datacenter-qoss', dcId]     — the vNIC profile modal's QoS picker
function invalidateQosQueries(queryClient: ReturnType<typeof useQueryClient>, dcId: string) {
  void queryClient.invalidateQueries({ queryKey: ['datacenter', dcId, 'qoss'] })
  void queryClient.invalidateQueries({ queryKey: ['datacenter-qoss', dcId] })
}

// The New QoS modal's save mutation. Mirrors useCreateVnicProfile: notify on
// success/failure and invalidate the QoS queries so both the tab and the pickers
// refetch and show the new profile.
export function useCreateDataCenterQos() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      dataCenterId,
      payload,
    }: {
      dataCenterId: string
      payload: Record<string, unknown>
    }) => createDataCenterQos(dataCenterId, payload),
    onSuccess: (qos) => {
      notify({ title: `QoS profile ${qos.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId }) => {
      invalidateQosQueries(queryClient, dataCenterId)
    },
  })
}

// The Edit QoS modal's save mutation. Mirrors useUpdateVnicProfile: notify on
// success/failure and invalidate the QoS queries so the edit lands everywhere.
export function useUpdateDataCenterQos() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      dataCenterId,
      qosId,
      payload,
    }: {
      dataCenterId: string
      qosId: string
      payload: Record<string, unknown>
    }) => updateDataCenterQos(dataCenterId, qosId, payload),
    onSuccess: (qos) => {
      notify({ title: `Changes to ${qos.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId }) => {
      invalidateQosQueries(queryClient, dataCenterId)
    },
  })
}

// The Remove QoS mutation. Mirrors useDeleteVnicProfile: notify on
// success/failure and invalidate the QoS queries so the refetch drops the
// removed profile. Takes { name } so the success toast can name it. The engine
// rejects a QoS still referenced by a network/profile with an in-use fault; that
// fault surfaces verbatim through error.message.
export function useDeleteDataCenterQos() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ dataCenterId, qosId }: { dataCenterId: string; qosId: string; name?: string }) =>
      deleteDataCenterQos(dataCenterId, qosId),
    onSuccess: (_data, { name }) => {
      notify({ title: `QoS profile ${name ?? ''} removed`.trim(), variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { dataCenterId }) => {
      invalidateQosQueries(queryClient, dataCenterId)
    },
  })
}
