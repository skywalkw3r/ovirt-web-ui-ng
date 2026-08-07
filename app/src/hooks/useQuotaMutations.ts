import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createQuota,
  createQuotaClusterLimit,
  createQuotaStorageLimit,
  deleteQuota,
  deleteQuotaClusterLimit,
  deleteQuotaStorageLimit,
  getQuota,
  listQuotaClusterLimits,
  listQuotaStorageLimits,
  updateQuota,
  updateQuotaClusterLimit,
  updateQuotaStorageLimit,
} from '../api/resources/quotas'
import { useCapabilities } from '../auth/capabilities'
import { useNotify } from '../notifications/context'
import { useAdminResourcePollInterval } from './useAdminResources'

// The three quota mutations invalidate ['quotas'] — the flat key useQuotas
// registers on QuotasPage — so the list refetches after a write. Quotas are
// admin-only server-side; QuotasPage already gates the whole route behind
// loaded && isAdmin, so these mutations don't re-gate.

// The New Quota modal's save mutation. Quotas are minted under a data center, so
// the create takes the chosen DC id plus the top-level body.
export function useCreateQuota() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ dcId, body }: { dcId: string; body: Record<string, unknown> }) =>
      createQuota(dcId, body),
    onSuccess: (quota) => {
      notify({ title: `Quota ${quota.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (name required,
      // duplicate name in the data center)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotas'] })
    },
  })
}

// The Edit Quota modal's save mutation. Once created a quota is edited at the
// flat /quotas/{id} endpoint (its data center is fixed). Invalidates both the
// flat ['quotas'] list (QuotasPage) and the ['quota', id] detail read
// (QuotaDetailPage) so whichever surface opened the modal refetches at once
// rather than waiting on its poll.
export function useUpdateQuota() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateQuota(id, body),
    onSuccess: (quota) => {
      notify({ title: `Changes to ${quota.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['quotas'] })
      void queryClient.invalidateQueries({ queryKey: ['quota', id] })
    },
  })
}

// The QuotaDetailPage's single-quota read. Keyed ['quota', id] — the prefix the
// ['quota', id, 'clusterLimits'/'storageLimits'] limit queries below extend, so
// an edit's ['quota', id] invalidation refreshes the header/General tab (and,
// by prefix match, harmlessly re-reads the limit grids). Admin-only server-side
// (matches the limit hooks and the admin-gated detail route); the empty-id
// guard keeps it idle until a quotaId is in hand.
export function useQuota(quotaId: string) {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['quota', quotaId],
    queryFn: () => getQuota(quotaId),
    refetchInterval,
    enabled: isAdmin && quotaId !== '',
  })
}

// The QuotasPage per-row Remove mutation. The engine 409s a quota still assigned
// to objects; that fault surfaces verbatim via ApiError.
export function useDeleteQuota() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ id }: { id: string; name?: string }) => deleteQuota(id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Quota ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotas'] })
    },
  })
}

// --- Per-object limits -----------------------------------------------------
// The limit sub-collections back the (deferred) per-cluster/per-storage limit
// editor. The queries follow the admin-collection poll floor and gate on the
// admin flag + a non-empty quota id (so a closed editor stays idle). The
// mutations invalidate the matching limit query so the editor refetches.

export function useQuotaClusterLimits(quotaId: string) {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['quota', quotaId, 'clusterLimits'],
    queryFn: () => listQuotaClusterLimits(quotaId),
    refetchInterval,
    enabled: isAdmin && quotaId !== '',
  })
}

export function useQuotaStorageLimits(quotaId: string) {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['quota', quotaId, 'storageLimits'],
    queryFn: () => listQuotaStorageLimits(quotaId),
    refetchInterval,
    enabled: isAdmin && quotaId !== '',
  })
}

export function useCreateQuotaClusterLimit() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({ quotaId, body }: { quotaId: string; body: Record<string, unknown> }) =>
      createQuotaClusterLimit(quotaId, body),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: (_data, _error, { quotaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'clusterLimits'] })
    },
  })
}

export function useUpdateQuotaClusterLimit() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      quotaId,
      limitId,
      body,
    }: {
      quotaId: string
      limitId: string
      body: Record<string, unknown>
    }) => updateQuotaClusterLimit(quotaId, limitId, body),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: (_data, _error, { quotaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'clusterLimits'] })
    },
  })
}

export function useDeleteQuotaClusterLimit() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({ quotaId, limitId }: { quotaId: string; limitId: string }) =>
      deleteQuotaClusterLimit(quotaId, limitId),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: (_data, _error, { quotaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'clusterLimits'] })
    },
  })
}

export function useCreateQuotaStorageLimit() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({ quotaId, body }: { quotaId: string; body: Record<string, unknown> }) =>
      createQuotaStorageLimit(quotaId, body),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: (_data, _error, { quotaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'storageLimits'] })
    },
  })
}

export function useUpdateQuotaStorageLimit() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      quotaId,
      limitId,
      body,
    }: {
      quotaId: string
      limitId: string
      body: Record<string, unknown>
    }) => updateQuotaStorageLimit(quotaId, limitId, body),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: (_data, _error, { quotaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'storageLimits'] })
    },
  })
}

export function useDeleteQuotaStorageLimit() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({ quotaId, limitId }: { quotaId: string; limitId: string }) =>
      deleteQuotaStorageLimit(quotaId, limitId),
    onError: (error) => notify({ title: error.message, variant: 'danger' }),
    onSettled: (_data, _error, { quotaId }) => {
      void queryClient.invalidateQueries({ queryKey: ['quota', quotaId, 'storageLimits'] })
    },
  })
}
