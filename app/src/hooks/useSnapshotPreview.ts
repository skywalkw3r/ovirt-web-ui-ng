import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { commitSnapshot, previewSnapshot, undoSnapshot } from '../api/resources/snapshots'
import type { Snapshot } from '../api/schemas/snapshot'
import { useNotify } from '../notifications/context'

// The engine's snapshot preview flow: preview a snapshot on a down VM,
// optionally start it to inspect the previewed state, then commit (keep) or
// undo (discard). Toast wording mirrors useSnapshots; ApiError.message
// carries the engine fault detail verbatim.

// Preview/commit/undo rewrite the VM itself as well as its snapshot chain.
// ['vm', vmId] is a prefix invalidation so it already covers the snapshots
// key, but the snapshots key is named explicitly to make the intent obvious;
// ['vms'] refreshes the list rows the VM appears in.
function invalidatePreviewQueries(queryClient: QueryClient, vmId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['vm', vmId, 'snapshots'] })
  void queryClient.invalidateQueries({ queryKey: ['vm', vmId] })
  void queryClient.invalidateQueries({ queryKey: ['vms'] })
}

export function usePreviewSnapshot(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (snapshot: Snapshot) => previewSnapshot(vmId, snapshot.id),
    onSuccess: (_data, snapshot) => {
      notify({
        title: `Previewing snapshot '${snapshot.description ?? snapshot.id}'`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidatePreviewQueries(queryClient, vmId),
  })
}

export function useCommitSnapshot(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: () => commitSnapshot(vmId),
    onSuccess: () => {
      notify({ title: 'Snapshot preview committed', variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidatePreviewQueries(queryClient, vmId),
  })
}

export function useUndoSnapshot(vmId: string) {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: () => undoSnapshot(vmId),
    onSuccess: () => {
      notify({ title: 'Snapshot preview undone', variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => invalidatePreviewQueries(queryClient, vmId),
  })
}
