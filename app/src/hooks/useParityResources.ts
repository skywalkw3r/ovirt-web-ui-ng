import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getErratum, listErrata } from '../api/resources/errata'
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

// Query-key builders for the parity collections this module owns. `all` is
// the list entry AND the prefix the provider mutations invalidate; the errata
// detail read nests under the list prefix so an errata invalidation covers it.
export const providerKeys = {
  all: ['providers'] as const,
  // the external networks a provider exposes (ProviderNetworksTab + the two
  // import modals); NOT under the ['providers'] prefix — a provider-list
  // invalidation deliberately leaves the fetched network catalog alone
  networks: (id: string) => ['provider', id, 'networks'] as const,
}

export const errataKeys = {
  all: ['errata'] as const,
  detail: (id: string) => ['errata', id] as const,
}

// Quotas: `all` is the flat list entry useQuotas registers AND the prefix the
// quota mutations invalidate; `detail` and the per-quota slices are what
// useQuotaMutations' reads and the quota tabs register.
export const quotaKeys = {
  all: ['quotas'] as const,
  detail: (id: string) => ['quota', id] as const,
  clusterLimits: (id: string) => ['quota', id, 'clusterLimits'] as const,
  storageLimits: (id: string) => ['quota', id, 'storageLimits'] as const,
  templates: (id: string) => ['quota', id, 'templates'] as const,
  permissions: (id: string) => ['quota', id, 'permissions'] as const,
}

// Gluster volumes: `all` is the flat list entry useGlusterVolumes registers
// (and every volume write invalidates); bricks and tunable options cache under
// their own per-volume keys so a volume's modals refetch independently of the
// flat list (components/volume-form/useVolumeMutations).
export const glusterVolumeKeys = {
  all: ['glustervolumes'] as const,
  bricks: (clusterId: string, volumeId: string) => ['glusterbricks', clusterId, volumeId] as const,
  options: (clusterId: string, volumeId: string) =>
    ['glustervolumeoptions', clusterId, volumeId] as const,
}

// listQuotas fans out GET /datacenters/{id}/quotas per data center and
// flattens the results.
export function useQuotas() {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: quotaKeys.all,
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
    queryKey: providerKeys.all,
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
      void queryClient.invalidateQueries({ queryKey: providerKeys.all })
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
      void queryClient.invalidateQueries({ queryKey: providerKeys.all })
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
      void queryClient.invalidateQueries({ queryKey: providerKeys.all })
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
    queryKey: errataKeys.all,
    queryFn: () => listErrata(),
    refetchInterval,
    enabled: isAdmin,
  })
}

// GET /katelloerrata/{id} — one erratum for ErratumDetailPage, keyed under the
// list's ['errata'] prefix. Admin-gated like useErrata: the page renders
// <NotPermitted> for user-tier accounts, so the doomed request is skipped
// (isAdmin stays false until the capability profile loads, so the gate is
// safe). A 404 is a genuine "this erratum is gone" the page surfaces as its
// error state — getErratum does not swallow it the way listErrata does.
export function useErratum(id: string) {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: errataKeys.detail(id),
    queryFn: () => getErratum(id),
    refetchInterval,
    enabled: isAdmin,
  })
}

// listGlusterVolumes fans out GET /clusters/{id}/glustervolumes per cluster
// and flattens, tolerating the 404s virt-only clusters answer with. The
// VolumesPage parity view polls at the 60s admin floor; the Dashboard only
// needs a probe, so it passes { poll: false } to read the shared
// ['glustervolumes'] cache without adding that per-cluster fan-out to every
// Dashboard tick (on virt-only installs each cluster would 404 every tick).
// staleTime Infinity keeps the probe from refetching the shared entry on
// mount — whichever consumer mounts first seeds it.
export function useGlusterVolumes({ poll = true }: { poll?: boolean } = {}) {
  const { isAdmin } = useCapabilities()
  const pollInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: glusterVolumeKeys.all,
    queryFn: () => listGlusterVolumes(),
    refetchInterval: poll ? pollInterval : false,
    staleTime: poll ? 0 : Infinity,
    enabled: isAdmin,
  })
}
