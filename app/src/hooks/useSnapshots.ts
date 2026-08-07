import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
} from '../api/resources/snapshots'
import type { Snapshot } from '../api/schemas/snapshot'
import { useNotify } from '../notifications/context'
import { useSettings } from '../settings/SettingsProvider'

// Snapshot ops finish asynchronously on the engine ('locked' status); the
// poll below is what lets the UI watch them settle.
export function useSnapshots(vmId: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vm', vmId, 'snapshots'],
    queryFn: () => listSnapshots(vmId),
    refetchInterval: refreshIntervalMs,
  })
}

// Toast wording mirrors useVmActions: "requested"/"started" because the
// engine only acknowledges the op here. ApiError.message carries the engine
// fault detail verbatim.
export function useCreateSnapshot(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    // diskIds scopes the snapshot to a disk subset; undefined = engine
    // default (all disks)
    mutationFn: ({
      description,
      persistMemory,
      diskIds,
    }: {
      description: string
      persistMemory: boolean
      diskIds?: string[]
    }) => createSnapshot(vmId, description, persistMemory, diskIds),
    onSuccess: (_data, { description }) => {
      notify({ title: `Snapshot '${description}' creation started`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'snapshots'] })
    },
  })
}

export function useRestoreSnapshot(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (snapshot: Snapshot) => restoreSnapshot(vmId, snapshot.id),
    onSuccess: (_data, snapshot) => {
      notify({
        title: `Restore requested for snapshot '${snapshot.description ?? snapshot.id}'`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      // restore rewrites the VM itself, not just the snapshot list — the
      // ['vm', vmId] prefix also invalidates the snapshots key
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId] })
      void queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })
}

export function useDeleteSnapshot(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (snapshot: Snapshot) => deleteSnapshot(vmId, snapshot.id),
    onSuccess: (_data, snapshot) => {
      notify({
        title: `Deletion requested for snapshot '${snapshot.description ?? snapshot.id}'`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'snapshots'] })
    },
  })
}
