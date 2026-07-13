import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createClusterCpuProfile,
  deleteClusterCpuProfile,
  updateCpuProfile,
} from '../api/resources/clusters'
import { useNotify } from '../notifications/context'

// The three CPU-profile mutations all invalidate ['cluster', clusterId,
// 'cpuProfiles'] — the key useClusterCpuProfiles registers — so the cluster's
// CPU Profiles tab refetches after a write. Success toasts via notify(); errors
// surface the engine fault detail verbatim (ApiError.message). Mirror
// useClusterMutations' affinity-group mutations.

// The New CPU profile modal's save mutation — POST to the cluster subcollection.
export function useCreateClusterCpuProfile() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ clusterId, body }: { clusterId: string; body: Record<string, unknown> }) =>
      createClusterCpuProfile(clusterId, body),
    onSuccess: (profile) => {
      notify({ title: `CPU profile ${profile.name ?? ''} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (name required,
      // duplicate name)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId, 'cpuProfiles'] })
    },
  })
}

// The Edit CPU profile modal's save mutation. The assigned subcollection has no
// PUT, so this targets the top-level /cpuprofiles/{id}; clusterId rides only to
// key the cache invalidation for the tab.
export function useUpdateCpuProfile() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      profileId,
      body,
    }: {
      clusterId: string
      profileId: string
      body: Record<string, unknown>
    }) => updateCpuProfile(profileId, body),
    onSuccess: (profile) => {
      notify({ title: `Changes to ${profile.name ?? 'CPU profile'} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId, 'cpuProfiles'] })
    },
  })
}

// The CPU Profiles tab's per-row Delete mutation.
export function useDeleteClusterCpuProfile() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      clusterId,
      profileId,
    }: {
      clusterId: string
      profileId: string
      name?: string
    }) => deleteClusterCpuProfile(clusterId, profileId),
    onSuccess: (_data, { name }) => {
      notify({ title: `CPU profile ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      // an in-use profile is rejected by the engine — the fault rides verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: ['cluster', clusterId, 'cpuProfiles'] })
    },
  })
}
