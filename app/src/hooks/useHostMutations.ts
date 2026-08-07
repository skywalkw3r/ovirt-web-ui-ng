import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addHost,
  createFenceAgent,
  deleteFenceAgent,
  deleteHost,
  setupHostNetworks,
  updateFenceAgent,
  updateHost,
  type AddHostSpec,
  type SetupNetworksSpec,
} from '../api/resources/hosts'
import { useNotify } from '../notifications/context'

// The New Host modal's create mutation. POST /hosts only kicks off the
// engine's async install pipeline — the host comes back at status
// 'installing', so the toast says installing rather than pretending the add
// finished. Invalidates the ['hosts'] list prefix (every ['hosts', search]
// entry useHosts registers) so the refetch picks up the new row; polling then
// walks the status to 'up'/'maintenance' (or 'install_failed') on its own.
export function useAddHost() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: (spec: AddHostSpec) => addHost(spec),
    // the spec carries the host root password as mutation variables — drop
    // the settled entry from the MutationCache immediately instead of the
    // default ~5min gcTime (security posture: credentials live only in the
    // mounted modal's state and the in-flight request)
    gcTime: 0,
    onSuccess: (host) => {
      notify({ title: `Installing host ${host.name}`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
    },
  })
}

// The Edit Host modal's save mutation. Mirrors useUpdateTemplate: notify on
// success/failure and invalidate the host detail (['host', id] — the key
// useHost registers, and the prefix every ['host', id, <slice>] subcollection
// entry in useHostDetail shares) and the inventory list (['hosts'] — the
// prefix every ['hosts', search] entry useHosts registers) so both refetch
// and show the edit.
export function useUpdateHost() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateHost(id, payload),
    onSuccess: (host) => {
      notify({ title: `Changes to ${host.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['host', id] })
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
    },
  })
}

// The Setup Networks dialog's apply mutation. One POST carries the whole
// attach/detach/re-IP/sync diff; commit_on_success in the spec (default true)
// folds webadmin's follow-up CommitNetworkChanges call into the same request,
// so no commitnetconfig chaining is needed here (commitHostNetConfig stays
// available as the pre-4.3 fallback). Invalidates the ['host', id] prefix —
// that covers the ['host', id, 'nics'] and ['host', id, 'networkAttachments']
// keys the NICs tab reads, plus the host detail itself.
export function useSetupHostNetworks() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, spec }: { id: string; spec: SetupNetworksSpec }) =>
      setupHostNetworks(id, spec),
    onSuccess: () => {
      notify({ title: 'Network changes applied', variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['host', id] })
    },
  })
}

// The host detail header's Remove mutation. Mirrors useDeleteTemplate: notify
// on success/failure and invalidate the ['hosts'] list prefix so the refetch
// drops the removed one. The caller navigates back to the list on success.
// The engine only removes hosts in maintenance — the detail page disables the
// Remove action otherwise, and the engine answers 409 anyway.
export function useDeleteHost() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteHost(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Host ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['hosts'] })
    },
  })
}

// --- Fence agents ----------------------------------------------------------
// The three fence-agent mutations are immediate writes against the
// /hosts/{id}/fenceagents sub-collection (independent of the host modal's
// Save). Each invalidates ['host', id, 'fenceAgents'] — the key
// useHostFenceAgents registers — so the editor's agent table refetches after a
// write.

// The Add/Edit fence-agent modal's create mutation. The payload carries the
// write-only fence password as mutation variables, so — mirroring useAddHost —
// gcTime:0 drops the settled entry from the MutationCache immediately instead
// of retaining the secret for the default ~5min.
export function useCreateFenceAgent() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ hostId, body }: { hostId: string; body: Record<string, unknown> }) =>
      createFenceAgent(hostId, body),
    gcTime: 0,
    onSuccess: (agent) => {
      notify({ title: `Fence agent ${agent.type ?? ''} added`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { hostId }) => {
      void queryClient.invalidateQueries({ queryKey: ['host', hostId, 'fenceAgents'] })
    },
  })
}

// The Add/Edit fence-agent modal's update mutation. Same gcTime:0 secret
// posture as the create — the body MAY carry a new password (omitted when the
// user left the field blank, so the engine preserves the stored one).
export function useUpdateFenceAgent() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      hostId,
      agentId,
      body,
    }: {
      hostId: string
      agentId: string
      body: Record<string, unknown>
    }) => updateFenceAgent(hostId, agentId, body),
    gcTime: 0,
    onSuccess: (agent) => {
      notify({ title: `Changes to fence agent ${agent.type ?? ''} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { hostId }) => {
      void queryClient.invalidateQueries({ queryKey: ['host', hostId, 'fenceAgents'] })
    },
  })
}

// The agent table's per-row Remove mutation (confirmed via ConfirmModal).
export function useDeleteFenceAgent() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ hostId, agentId }: { hostId: string; agentId: string; type?: string }) =>
      deleteFenceAgent(hostId, agentId),
    onSuccess: (_data, { type }) => {
      notify({ title: `Fence agent ${type ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { hostId }) => {
      void queryClient.invalidateQueries({ queryKey: ['host', hostId, 'fenceAgents'] })
    },
  })
}
