import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listErrata } from '../api/resources/errata'
import {
  createProvider,
  deleteProvider,
  listProviders,
  testProviderConnectivity,
  updateProvider,
} from '../api/resources/providers'
import type { ProviderType } from '../api/schemas/provider'
import { listQuotas } from '../api/resources/quotas'
import { listGlusterVolumes } from '../api/resources/volumes'
import { useCapabilities } from '../auth/capabilities'
import { useNotify } from '../notifications/context'
import { useAdminResourcePollInterval } from './useAdminResources'

// Admin Portal parity resources: quotas, external providers, errata, and
// gluster volumes are near-static inventory, so they share the 60s-floor
// cadence of the other admin collections (useAdminResourcePollInterval).
// All four need an admin session on the engine — each query skips the doomed
// request for user-tier accounts (their pages render <NotPermitted> instead).
// Gating on isAdmin alone is safe: it stays false until the profile has
// loaded.

// listQuotas fans out GET /datacenters/{id}/quotas per data center and
// flattens the results.
export function useQuotas() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['quotas'],
    queryFn: () => listQuotas(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// listProviders aggregates the typed external-provider collections
// (/externalhostproviders, /openstackimageproviders,
// /openstacknetworkproviders, /openstackvolumeproviders), tagging each entry
// with its providerType.
export function useProviders() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => listProviders(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// The three provider mutations invalidate ['providers'] so the list refetches
// after a write. External providers are admin-only server-side; ProvidersPage
// already gates the whole route behind loaded && isAdmin, so these don't
// re-gate. Each carries a credential-bearing body as mutation variables, so —
// mirroring useCreateFenceAgent — gcTime:0 drops the settled entry from the
// MutationCache immediately instead of retaining the secret for the default
// ~5min.

// The New provider modal's create mutation. The collection path is selected by
// the draft's provider type.
export function useCreateProvider() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ type, body }: { type: ProviderType; body: Record<string, unknown> }) =>
      createProvider(type, body),
    gcTime: 0,
    onSuccess: (provider) => {
      notify({ title: `Provider ${provider.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (name/url
      // required, duplicate name, unreachable provider)
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}

// The Edit provider modal's save mutation. Same gcTime:0 secret posture as the
// create — the body MAY carry a new password (omitted when the user left the
// field blank, so the engine preserves the stored one).
export function useUpdateProvider() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({
      type,
      id,
      body,
    }: {
      type: ProviderType
      id: string
      body: Record<string, unknown>
    }) => updateProvider(type, id, body),
    gcTime: 0,
    onSuccess: (provider) => {
      notify({ title: `Changes to ${provider.name} saved`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}

// The ProvidersPage per-row Remove mutation (confirmed via ConfirmModal). Takes
// { type, id, name } so the path is type-selected and the toast can name it.
export function useDeleteProvider() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  return useMutation({
    mutationFn: ({ type, id }: { type: ProviderType; id: string; name?: string }) =>
      deleteProvider(type, id),
    onSuccess: (_data, { name }) => {
      notify({ title: `Provider ${name ?? ''} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}

// The Edit provider modal's "Test" button. POSTs the testconnectivity action on
// the stored provider (only editable providers have an id to test) and reports
// success/failure INLINE in the modal — no toast, no list refetch. Success is
// "the promise resolved"; a failure throws an ApiError whose engine fault detail
// (error.message) surfaces in the inline alert. gcTime:0 matches the create/edit
// mutations: the variables never carry a secret, but the settled entry is dropped
// immediately so nothing lingers in the MutationCache.
export function useTestProviderConnectivity() {
  return useMutation({
    mutationFn: ({ type, id }: { type: ProviderType; id: string }) =>
      testProviderConnectivity(type, id),
    gcTime: 0,
  })
}

// GET /katelloerrata — usually an empty list unless the engine is connected
// to a Foreman/Satellite instance (ErrataPage's empty state says so).
export function useErrata() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['errata'],
    queryFn: () => listErrata(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// listGlusterVolumes fans out GET /clusters/{id}/glustervolumes per cluster
// and flattens, tolerating the 404s virt-only clusters answer with.
export function useGlusterVolumes() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: ['glustervolumes'],
    queryFn: () => listGlusterVolumes(),
    refetchInterval,
    enabled: isAdmin,
  })
}
