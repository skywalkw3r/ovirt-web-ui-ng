import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createAffinityLabel,
  createCluster,
  createClusterAffinityGroup,
  deleteAffinityLabel,
  deleteCluster,
  deleteClusterAffinityGroup,
  updateAffinityLabel,
  updateCluster,
  updateClusterAffinityGroup,
} from '../api/resources/clusters'
import { useNotify } from '../notifications/context'
import { clusterKeys } from './useAdminResources'

// The Create Cluster modal's save mutation. Mirrors useCreateNetwork: notify
// on success/failure and invalidate the cluster list query so the refetch shows
// the new one. The list key is ['clusters'] — the key useClusters registers.
export function useCreateCluster() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createCluster(payload),
    onSuccess: (cluster) => {
      notify({ title: `Cluster ${cluster.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: clusterKeys.all })
    },
  })
}

// The Edit Cluster modal's save mutation. Mirrors useUpdateNetwork: notify on
// success/failure and invalidate the cluster detail (['cluster', id] — the key
// useClusterDetail registers) and list (['clusters']) queries so both refetch
// and show the edit.
export function useUpdateCluster() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateCluster(id, payload),
    onSuccess: (cluster) => {
      notify({ title: `Changes to ${cluster.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: clusterKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: clusterKeys.all })
    },
  })
}

// The cluster detail header's Remove mutation. Mirrors useRemoveVm: notify on
// success/failure and invalidate the cluster list query so the refetch drops
// the removed one. The caller navigates back to the list on success. The list
// key is ['clusters'] — the key useClusters registers.
export function useDeleteCluster() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteCluster(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Cluster ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: clusterKeys.all })
    },
  })
}

// --- Affinity groups -------------------------------------------------------
// The three group mutations invalidate ['cluster', clusterId, 'affinityGroups']
// — the key useClusterAffinityGroups (and the -Full variant) register — so the
// cluster's Affinity Groups tab refetches after a write.

// The Create Affinity Group modal's save mutation.
export function useCreateAffinityGroup() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ clusterId, body }: { clusterId: string; body: Record<string, unknown> }) =>
      createClusterAffinityGroup(clusterId, body),
    onSuccess: (group) => {
      notify({ title: `Affinity group ${group.name ?? ''} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (name required,
      // duplicate name, both-rules-disabled, member-not-in-cluster)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: clusterKeys.affinityGroups(clusterId) })
    },
  })
}

// The Edit Affinity Group modal's save mutation.
export function useUpdateAffinityGroup() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      clusterId,
      groupId,
      body,
    }: {
      clusterId: string
      groupId: string
      body: Record<string, unknown>
    }) => updateClusterAffinityGroup(clusterId, groupId, body),
    onSuccess: (group) => {
      notify({ title: `Changes to ${group.name ?? 'affinity group'} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: clusterKeys.affinityGroups(clusterId) })
    },
  })
}

// The Affinity Groups tab's per-row Delete mutation.
export function useDeleteAffinityGroup() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ clusterId, groupId }: { clusterId: string; groupId: string; name?: string }) =>
      deleteClusterAffinityGroup(clusterId, groupId),
    onSuccess: (_data, { name }) => {
      notify({ title: `Affinity group ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: clusterKeys.affinityGroups(clusterId) })
    },
  })
}

// --- Affinity labels -------------------------------------------------------
// Labels are engine-GLOBAL, so the three label mutations invalidate BOTH the
// per-cluster read key ['cluster', clusterId, 'affinityLabels'] (the cluster
// tab) AND the global ['affinityLabels'] key (the VM/host label tabs read the
// global collection). clusterId is optional — the VM/host tabs may edit a label
// without a cluster in hand, so only the global key is invalidated then.

// The global /affinitylabels collection key the label mutations invalidate.
// NOTE: no read currently registers this bare key — the VM/host Affinity
// Labels tabs read the global catalog under their own per-entity picker
// entries (vmKeys.affinityLabelPicker; the host tab through useHostDetail's
// per-host slice) — so the invalidation is a no-op until a consumer adopts
// it. Kept verbatim (see the builder follow-up list) rather than retargeted
// here, which would be a cache-contract change.
export const affinityLabelKeys = {
  all: ['affinityLabels'] as const,
}

// The Create Affinity Label modal's save mutation.
export function useCreateAffinityLabel() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ body }: { clusterId?: string; body: Record<string, unknown> }) =>
      createAffinityLabel(body),
    onSuccess: (label) => {
      notify({ title: `Affinity label ${label.name ?? ''} created`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: affinityLabelKeys.all })
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: clusterKeys.affinityLabels(clusterId) })
      }
    },
  })
}

// The Edit Affinity Label modal's save mutation.
export function useUpdateAffinityLabel() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      labelId,
      body,
    }: {
      clusterId?: string
      labelId: string
      body: Record<string, unknown>
    }) => updateAffinityLabel(labelId, body),
    onSuccess: (label) => {
      notify({ title: `Changes to ${label.name ?? 'affinity label'} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: affinityLabelKeys.all })
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: clusterKeys.affinityLabels(clusterId) })
      }
    },
  })
}

// The Affinity Labels tab's per-row Delete mutation.
export function useDeleteAffinityLabel() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ labelId }: { clusterId?: string; labelId: string; name?: string }) =>
      deleteAffinityLabel(labelId),
    onSuccess: (_data, { name }) => {
      notify({ title: `Affinity label ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: affinityLabelKeys.all })
      if (clusterId) {
        void queryClient.invalidateQueries({ queryKey: clusterKeys.affinityLabels(clusterId) })
      }
    },
  })
}
