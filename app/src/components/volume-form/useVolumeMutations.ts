import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addGlusterBricks,
  createGlusterVolume,
  deleteGlusterVolume,
  listGlusterBricks,
  listGlusterVolumeOptions,
  migrateGlusterBricks,
  rebalanceGlusterVolume,
  removeGlusterBricks,
  resetAllGlusterVolumeOptions,
  resetGlusterVolumeOption,
  setGlusterVolumeOption,
  startGlusterVolume,
  startGlusterVolumeProfile,
  stopGlusterVolume,
  stopGlusterVolumeProfile,
  stopMigrateGlusterBricks,
  type BrickDraft,
  type BrickRef,
} from '../../api/resources/volumes'
import { useCapabilities } from '../../auth/capabilities'
import { useNotify } from '../../notifications/context'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'

// The flat gluster-volumes list (useGlusterVolumes in useParityResources) caches
// under this key; every write invalidates it so the list reflects the change.
const VOLUMES_KEY = ['glustervolumes']

// Bricks live under a per-volume key so a volume's bricks modal caches (and the
// add-bricks write invalidates) independently of the flat list.
function bricksKey(clusterId: string, volumeId: string) {
  return ['glusterbricks', clusterId, volumeId]
}

// A volume's tunable options cache under their own per-volume key so the Manage
// Options modal caches (and set/reset writes invalidate) independently.
function optionsKey(clusterId: string, volumeId: string) {
  return ['glustervolumeoptions', clusterId, volumeId]
}

// The bricks a volume is built from (the Bricks modal). Admin-only server-side,
// like the rest of the gluster surface; gating on isAdmin alone is safe (it stays
// false until the profile loads). Bricks drift slowly — reuse the 60s admin-parity
// floor. `enabled` lets the caller hold the query until its modal opens.
export function useGlusterBricks(clusterId: string, volumeId: string, enabled: boolean) {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: bricksKey(clusterId, volumeId),
    queryFn: () => listGlusterBricks(clusterId, volumeId),
    refetchInterval,
    enabled: isAdmin && enabled,
  })
}

// The New volume modal's create mutation. Takes { clusterId, body } — the body is
// the buildCreateVolumePayload result. Invalidates the flat list on settle.
export function useCreateVolume() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({ clusterId, body }: { clusterId: string; body: Record<string, unknown> }) =>
      createGlusterVolume(clusterId, body),
    onSuccess: (volume) => {
      notify({ title: `Volume ${volume.name} created`, variant: 'success' })
    },
    onError: (error) => {
      // ApiError.message carries the engine fault detail verbatim (duplicate
      // name, unreachable brick host, virt-only cluster).
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}

// Add bricks to an existing volume (the Bricks modal's expand action). Invalidates
// both the volume's bricks query and the flat list (brick counts feed it).
export function useAddBricks() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      bricks,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
      bricks: BrickDraft[]
    }) => addGlusterBricks(clusterId, volumeId, bricks),
    onSuccess: (_data, { bricks, volumeName }) => {
      const count = bricks.length
      notify({
        title: `${count} ${count === 1 ? 'brick' : 'bricks'} added to ${volumeName ?? 'volume'}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId, volumeId }) => {
      void queryClient.invalidateQueries({ queryKey: bricksKey(clusterId, volumeId) })
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}

// The per-row Start action (force optional). A success toast names the volume;
// the flat list refetches so the status column follows.
export function useStartVolume() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      force,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
      force?: boolean
    }) => startGlusterVolume(clusterId, volumeId, { force }),
    onSuccess: (_data, { volumeName }) => {
      notify({ title: `Volume ${volumeName ?? ''} started`.trim(), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}

// The per-row Stop action (force optional). Stopping makes the volume's data
// inaccessible, so the caller gates it behind a confirm.
export function useStopVolume() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      force,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
      force?: boolean
    }) => stopGlusterVolume(clusterId, volumeId, { force }),
    onSuccess: (_data, { volumeName }) => {
      notify({ title: `Volume ${volumeName ?? ''} stopped`.trim(), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}

// The per-row Rebalance action (fixLayout / force optional) — only offered for
// distributed volume types.
export function useRebalanceVolume() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      fixLayout,
      force,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
      fixLayout?: boolean
      force?: boolean
    }) => rebalanceGlusterVolume(clusterId, volumeId, { fixLayout, force }),
    onSuccess: (_data, { volumeName }) => {
      notify({ title: `Rebalance started for ${volumeName ?? 'volume'}`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}

// ─── Brick removal / migration (the Bricks modal's 2-step remove) ────────────

// Commit removal of the selected bricks (webadmin's Remove without migration, or
// the second leg after migrating data off). Invalidates the volume's bricks and
// the flat list (brick counts feed it).
export function useRemoveBricks() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      bricks,
      replicaCount,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
      bricks: BrickRef[]
      replicaCount?: number
    }) => removeGlusterBricks(clusterId, volumeId, bricks, { replicaCount }),
    onSuccess: (_data, { bricks, volumeName }) => {
      const count = bricks.length
      notify({
        title: `${count} ${count === 1 ? 'brick' : 'bricks'} removed from ${volumeName ?? 'volume'}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId, volumeId }) => {
      void queryClient.invalidateQueries({ queryKey: bricksKey(clusterId, volumeId) })
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}

// Start migrating data off the selected bricks (step 1 of the 2-step remove).
export function useMigrateBricks() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      bricks,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
      bricks: BrickRef[]
    }) => migrateGlusterBricks(clusterId, volumeId, bricks),
    onSuccess: (_data, { bricks, volumeName }) => {
      const count = bricks.length
      notify({
        title: `Data migration started for ${count} ${count === 1 ? 'brick' : 'bricks'} on ${
          volumeName ?? 'volume'
        }`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId, volumeId }) => {
      void queryClient.invalidateQueries({ queryKey: bricksKey(clusterId, volumeId) })
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}

// Cancel an in-flight brick data migration.
export function useStopMigrateBricks() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      bricks,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
      bricks: BrickRef[]
    }) => stopMigrateGlusterBricks(clusterId, volumeId, bricks),
    onSuccess: (_data, { volumeName }) => {
      notify({ title: `Migration stopped on ${volumeName ?? 'volume'}`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId, volumeId }) => {
      void queryClient.invalidateQueries({ queryKey: bricksKey(clusterId, volumeId) })
    },
  })
}

// ─── Volume options (the Manage Options modal) ───────────────────────────────

// The volume's current tunables. Admin-only server-side like the rest of the
// gluster surface; reuse the 60s admin-parity floor. `enabled` holds the query
// until the modal opens.
export function useVolumeOptions(clusterId: string, volumeId: string, enabled: boolean) {
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  return useQuery({
    queryKey: optionsKey(clusterId, volumeId),
    queryFn: () => listGlusterVolumeOptions(clusterId, volumeId),
    refetchInterval,
    enabled: isAdmin && enabled,
  })
}

// Set (or change) one tunable. Invalidates the options query so the table
// reflects the new value.
export function useSetVolumeOption() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      name,
      value,
    }: {
      clusterId: string
      volumeId: string
      name: string
      value: string
    }) => setGlusterVolumeOption(clusterId, volumeId, name, value),
    onSuccess: (_data, { name }) => {
      notify({ title: `Option ${name} set`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId, volumeId }) => {
      void queryClient.invalidateQueries({ queryKey: optionsKey(clusterId, volumeId) })
    },
  })
}

// Reset one tunable to its default.
export function useResetVolumeOption() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
      name,
    }: {
      clusterId: string
      volumeId: string
      name: string
    }) => resetGlusterVolumeOption(clusterId, volumeId, name),
    onSuccess: (_data, { name }) => {
      notify({ title: `Option ${name} reset to default`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId, volumeId }) => {
      void queryClient.invalidateQueries({ queryKey: optionsKey(clusterId, volumeId) })
    },
  })
}

// Reset every tunable to its default (danger-confirmed by the caller).
export function useResetAllVolumeOptions() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
    }) => resetAllGlusterVolumeOptions(clusterId, volumeId),
    onSuccess: (_data, { volumeName }) => {
      notify({
        title: `All options reset to default on ${volumeName ?? 'volume'}`,
        variant: 'success',
      })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: (_data, _error, { clusterId, volumeId }) => {
      void queryClient.invalidateQueries({ queryKey: optionsKey(clusterId, volumeId) })
    },
  })
}

// ─── Volume profiling ────────────────────────────────────────────────────────

// Start gathering per-volume profiling counters. No cache to invalidate (the
// gathered data is a deferred view — see resources/volumes.ts).
export function useStartVolumeProfile() {
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
    }) => startGlusterVolumeProfile(clusterId, volumeId),
    onSuccess: (_data, { volumeName }) => {
      notify({ title: `Profiling started on ${volumeName ?? 'volume'}`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
  })
}

// Stop gathering profiling counters.
export function useStopVolumeProfile() {
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
    }) => stopGlusterVolumeProfile(clusterId, volumeId),
    onSuccess: (_data, { volumeName }) => {
      notify({ title: `Profiling stopped on ${volumeName ?? 'volume'}`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
  })
}

// The per-row Remove action (typed-name danger confirm gates the caller).
export function useDeleteVolume() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  return useMutation({
    mutationFn: ({
      clusterId,
      volumeId,
    }: {
      clusterId: string
      volumeId: string
      volumeName?: string
    }) => deleteGlusterVolume(clusterId, volumeId),
    onSuccess: (_data, { volumeName }) => {
      notify({ title: `Volume ${volumeName ?? ''} removed`.trim(), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: VOLUMES_KEY })
    },
  })
}
