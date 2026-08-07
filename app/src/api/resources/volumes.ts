import { z } from 'zod'
import { ApiError, request } from '../transport'
import {
  GlusterVolumeListSchema,
  GlusterVolumeSchema,
  type GlusterVolume,
} from '../schemas/gluster-volume'
import { listClusters } from './clusters'

// Gluster volumes only exist as a per-cluster subcollection, so the flat
// list the UI wants is the concatenation across every cluster.
export async function listGlusterVolumes(): Promise<GlusterVolume[]> {
  const clusters = await listClusters()
  // Per-cluster tolerance (Promise.allSettled): virt-only clusters answer 404
  // for the whole subcollection ("no Gluster here"), and a transient 5xx on one
  // cluster shouldn't fail (and, on the query retry, re-issue) the entire
  // fan-out — either way that branch is dropped. An auth verdict (401/403) is
  // the session breaking, not one cluster, so it propagates immediately (mirror
  // listProviders).
  const settled = await Promise.allSettled(
    clusters.map(async (cluster) => {
      const data = GlusterVolumeListSchema.parse(
        await request(`/clusters/${encodeURIComponent(cluster.id)}/glustervolumes`),
      )
      return data.gluster_volume ?? []
    }),
  )

  const authFailure = settled.find(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof ApiError &&
      (result.reason.status === 401 || result.reason.status === 403),
  )
  if (authFailure?.status === 'rejected') throw authFailure.reason

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

// ─── Bricks ──────────────────────────────────────────────────────────────────
// A brick is one server + directory pair that backs the volume. The flat volume
// list never inlines bricks (GlusterVolumeMapper links, never embeds), so the
// bricks view reads the per-volume subcollection. server_id is a host id — the
// name is resolved client-side against the cluster's cached hosts. The live
// engine serializes ids as strings; every field is optional so a partial brick
// row (status still settling) survives the parse.
export const GlusterBrickSchema = z.looseObject({
  id: z.string().optional(),
  // 'host1:/rhgs/data/brick1' — server:path, present on reads
  name: z.string().optional(),
  brick_dir: z.string().optional(),
  server_id: z.string().optional(),
  // 'up' | 'down' | 'unknown' — open string, same policy as volume status
  status: z.string().optional(),
})

// JSON quirk: the "brick" key is omitted when the list is empty, and the
// collection is keyed by the singular element name (mirror the transport_types
// wrapper on the volume schema).
export const GlusterBrickListSchema = z.looseObject({
  brick: z.array(GlusterBrickSchema).optional(),
})

export type GlusterBrick = z.infer<typeof GlusterBrickSchema>

// GET /clusters/{cid}/glustervolumes/{vid}/glusterbricks — the volume's bricks.
// 404-tolerant → [] for the same reason the top-level list is: a not-yet-ready
// or serviceless path answers 404 rather than an empty list.
// Verified against api-model services/gluster/GlusterBricksService.List.
export async function listGlusterBricks(
  clusterId: string,
  volumeId: string,
): Promise<GlusterBrick[]> {
  try {
    const data = GlusterBrickListSchema.parse(
      await request(
        `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
          volumeId,
        )}/glusterbricks`,
      ),
    )
    return data.brick ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// A server + directory pair the create / add-bricks forms collect. serverId is a
// host id; brickDir is the export path on that host.
export interface BrickDraft {
  serverId: string
  brickDir: string
}

// POST /clusters/{cid}/glustervolumes/{vid}/glusterbricks — expand a volume with
// more bricks. Verified against BackendGlusterBricksResource.add: the body is the
// GlusterBricks collection ({ brick: [...] }); each brick needs server_id +
// brick_dir; replica_count / stripe_count ride as QUERY params (read off uriInfo,
// not the body). The engine answers with the added bricks — we only need the
// promise to settle, so no parse.
export async function addGlusterBricks(
  clusterId: string,
  volumeId: string,
  bricks: BrickDraft[],
  opts: { replicaCount?: number; stripeCount?: number } = {},
): Promise<void> {
  const params = new URLSearchParams()
  if (opts.replicaCount !== undefined) params.set('replica_count', String(opts.replicaCount))
  if (opts.stripeCount !== undefined) params.set('stripe_count', String(opts.stripeCount))
  const qs = params.toString()
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/glusterbricks${qs ? `?${qs}` : ''}`,
    {
      method: 'POST',
      body: {
        brick: bricks.map((brick) => ({
          server_id: brick.serverId,
          brick_dir: brick.brickDir.trim(),
        })),
      },
    },
  )
}

// ─── Brick removal / migration (webadmin's 2-step remove-brick) ──────────────
// Removing bricks is a two-step dance: migrate the data off them first
// (GlusterBricksService.Migrate → the async remove-brick "start"), then commit
// the removal (GlusterBricksService.Remove → remove-brick "commit"/force). The
// modal offers a "migrate data" toggle: on ⇒ start migration, off ⇒ commit
// straight away (force removal, data on the bricks is discarded). stopmigrate
// cancels an in-flight migration. All verified against
// services/gluster/GlusterBricksService (Remove is a DELETE with @In bricks +
// replicaCount + async; Migrate/StopMigrate are POST actions with @In bricks)
// and BackendGlusterBricksResource (the bricks list rides in the request body as
// action.getBricks() → { bricks: { brick: [...] } }; replica_count rides as a
// QUERY param off uriInfo — the same body/query split as add).

// A brick reference the remove/migrate action bodies carry. The engine accepts
// either the brick id or its "server:dir" name (validateParameters(brick,
// "id|name")); the bricks read always carries an id, so prefer it.
export interface BrickRef {
  id?: string
  name?: string
}

function brickRefBody(brick: BrickRef): Record<string, unknown> {
  return brick.id ? { id: brick.id } : { name: brick.name ?? '' }
}

// DELETE /clusters/{cid}/glustervolumes/{vid}/glusterbricks — commit removal of
// the given bricks (the migrate-off-then-force path's second leg, or an
// immediate force removal when the user skips migration). replica_count reduces
// the volume's replica factor when removing a full replica set; omitted on a
// plain distribute removal.
export async function removeGlusterBricks(
  clusterId: string,
  volumeId: string,
  bricks: BrickRef[],
  opts: { replicaCount?: number } = {},
): Promise<void> {
  const params = new URLSearchParams()
  if (opts.replicaCount !== undefined) params.set('replica_count', String(opts.replicaCount))
  const qs = params.toString()
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/glusterbricks${qs ? `?${qs}` : ''}`,
    { method: 'DELETE', body: { bricks: { brick: bricks.map(brickRefBody) } } },
  )
}

// POST .../glusterbricks/migrate — start migrating data off the given bricks
// (step 1 of the 2-step remove). Answers an action envelope nothing downstream
// reads — settle-only.
export async function migrateGlusterBricks(
  clusterId: string,
  volumeId: string,
  bricks: BrickRef[],
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/glusterbricks/migrate`,
    { method: 'POST', body: { bricks: { brick: bricks.map(brickRefBody) } } },
  )
}

// POST .../glusterbricks/stopmigrate — cancel an in-flight brick data migration.
export async function stopMigrateGlusterBricks(
  clusterId: string,
  volumeId: string,
  bricks: BrickRef[],
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/glusterbricks/stopmigrate`,
    { method: 'POST', body: { bricks: { brick: bricks.map(brickRefBody) } } },
  )
}

// ─── Create ──────────────────────────────────────────────────────────────────
// The three volume types the create form offers, matching webadmin's VolumeModel
// dropdown (DISTRIBUTE / REPLICATE / DISTRIBUTED_REPLICATE). The wire enum
// (types/GlusterVolumeType) carries more (disperse, striped variants) but those
// are deprecated or HC-only in the UI, so the form stays with these three.
export type GlusterVolumeTypeOption = 'distribute' | 'replicate' | 'distributed_replicate'

// A replica count only rides for the replicated types — a plain distribute volume
// has none (the engine rejects replica_count on it).
export function isReplicatedType(type: GlusterVolumeTypeOption): boolean {
  return type === 'replicate' || type === 'distributed_replicate'
}

export interface CreateVolumeDraft {
  name: string
  volumeType: GlusterVolumeTypeOption
  replicaCount: number
  transportTcp: boolean
  transportRdma: boolean
  bricks: BrickDraft[]
}

// Build the POST body for a new gluster volume. Verified against
// BackendGlusterVolumesResource.add (required: name, volumeType, bricks) and the
// GlusterVolumeMapper (replica_count / transport_types are read from the body by
// the mapper, not the resource). Wire quirks: the bricks collection nests as
// { bricks: { brick: [...] } } and transport_types as { transport_type: [...] },
// the same collection-wrapper shape the read schema models. replica_count is
// omitted on plain distribute (the engine rejects it there); trimmed name +
// brick dirs match the AsciiName / path discipline.
export function buildCreateVolumePayload(draft: CreateVolumeDraft): Record<string, unknown> {
  const transportTypes: string[] = []
  if (draft.transportTcp) transportTypes.push('tcp')
  if (draft.transportRdma) transportTypes.push('rdma')

  const body: Record<string, unknown> = {
    name: draft.name.trim(),
    volume_type: draft.volumeType,
    bricks: {
      brick: draft.bricks.map((brick) => ({
        server_id: brick.serverId,
        brick_dir: brick.brickDir.trim(),
      })),
    },
  }

  if (isReplicatedType(draft.volumeType)) {
    body.replica_count = draft.replicaCount
  }

  if (transportTypes.length > 0) {
    body.transport_types = { transport_type: transportTypes }
  }

  return body
}

// POST /clusters/{cid}/glustervolumes — create a volume. The engine answers with
// the full created volume, parsed through GlusterVolumeSchema so the caller gets
// a coerced read model (mirror createCluster). A duplicate name, an unreachable
// brick host, or a virt-only cluster all surface as an ApiError with the engine
// fault detail verbatim.
export async function createGlusterVolume(
  clusterId: string,
  body: Record<string, unknown>,
): Promise<GlusterVolume> {
  return GlusterVolumeSchema.parse(
    await request(`/clusters/${encodeURIComponent(clusterId)}/glustervolumes`, {
      method: 'POST',
      body,
    }),
  )
}

// ─── Lifecycle actions ───────────────────────────────────────────────────────
// start / stop / rebalance are POST action sub-resources; remove is a DELETE on
// the volume. All verified against api-model services/gluster/GlusterVolumeService
// (Start/Stop take @In Boolean force; Rebalance takes @In Boolean fixLayout +
// force; Remove is a plain delete). Each answers with an empty/ignored body, so
// the promises only need to settle. An empty action body is sent as {} — the
// engine reads it as an empty <action/>.

// force restarts bricks that are down (webadmin's "Start Force").
export async function startGlusterVolume(
  clusterId: string,
  volumeId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/start`,
    { method: 'POST', body: opts.force ? { force: true } : {} },
  )
}

// force stops even when the volume is being used (data becomes inaccessible).
export async function stopGlusterVolume(
  clusterId: string,
  volumeId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/stop`,
    { method: 'POST', body: opts.force ? { force: true } : {} },
  )
}

// fixLayout only re-spreads the directory layout without migrating existing data;
// force can push a rebalance the engine would otherwise refuse.
export async function rebalanceGlusterVolume(
  clusterId: string,
  volumeId: string,
  opts: { fixLayout?: boolean; force?: boolean } = {},
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (opts.fixLayout) body.fix_layout = true
  if (opts.force) body.force = true
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/rebalance`,
    { method: 'POST', body },
  )
}

// DELETE the volume. Answers with an empty body, so the promise only settles
// (mirror deleteCluster).
export async function deleteGlusterVolume(clusterId: string, volumeId: string): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(volumeId)}`,
    { method: 'DELETE' },
  )
}

// ─── Volume options (tunables) ───────────────────────────────────────────────
// A gluster volume carries a set of key/value tunables (auth.allow,
// performance.cache-size, cluster.quorum-type, …). The Manage Options modal reads
// the current set and can set/reset individual keys or reset every key to its
// default. Verified against api-model types/GlusterVolume (options() is an inlined
// Option[] attribute — mapped unconditionally by GlusterVolumeMapper, not a
// followable link) and services/gluster/GlusterVolumeService (SetOption @In
// Option; ResetOption @In Option + optional force; ResetAllOptions @In async).
// Option itself is { name, value }.
export const GlusterVolumeOptionSchema = z.looseObject({
  name: z.string().optional(),
  value: z.string().optional(),
})

export type GlusterVolumeOption = z.infer<typeof GlusterVolumeOptionSchema>

// The single-volume read only models the options wrapper — everything else on
// the volume is already covered by GlusterVolumeSchema on the flat list. JSON
// quirk: the "option" key is omitted when the set is empty (same collection
// shape as the other wrappers).
const GlusterVolumeOptionsReadSchema = z.looseObject({
  options: z.looseObject({ option: z.array(GlusterVolumeOptionSchema).optional() }).optional(),
})

// GET /clusters/{cid}/glustervolumes/{vid} — the volume, read for its inlined
// `options`. A 404 here means the volume itself is gone (it was removed out from
// under the modal), so it propagates rather than degrading to [].
export async function listGlusterVolumeOptions(
  clusterId: string,
  volumeId: string,
): Promise<GlusterVolumeOption[]> {
  const data = GlusterVolumeOptionsReadSchema.parse(
    await request(
      `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(volumeId)}`,
    ),
  )
  return data.options?.option ?? []
}

// POST .../setoption — set or change one tunable. Body { option: { name, value } }.
export async function setGlusterVolumeOption(
  clusterId: string,
  volumeId: string,
  name: string,
  value: string,
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/setoption`,
    { method: 'POST', body: { option: { name: name.trim(), value: value.trim() } } },
  )
}

// POST .../resetoption — reset one tunable to its default. Body { option: { name } };
// force can push a reset the engine would otherwise refuse.
export async function resetGlusterVolumeOption(
  clusterId: string,
  volumeId: string,
  name: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const body: Record<string, unknown> = { option: { name: name.trim() } }
  if (opts.force) body.force = true
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/resetoption`,
    { method: 'POST', body },
  )
}

// POST .../resetalloptions — reset every tunable to its default. Takes only an
// async flag, so the action body is empty (the engine reads it as <action/>).
export async function resetAllGlusterVolumeOptions(
  clusterId: string,
  volumeId: string,
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/resetalloptions`,
    { method: 'POST', body: {} },
  )
}

// ─── Volume profiling ────────────────────────────────────────────────────────
// start/stop profiling toggle the volume's per-operation profiling counters.
// Verified against services/gluster/GlusterVolumeService (StartProfile /
// StopProfile take only @In Boolean async — an empty action body).
//
// DEFERRAL: the statistics VIEW is not built. Reading the gathered profile is
// GlusterVolumeService.GetProfileStatistics (GET .../statistics →
// GlusterVolumeProfileDetails, a nested brick/nfs profile tree), and there is a
// separate /statistics subcollection of raw Statistic samples. Both are dense,
// read-only telemetry surfaces with no write path; they are out of scope for
// this pass. The actions below let an admin turn profiling on/off; surfacing the
// collected data is a later, dedicated view.
export async function startGlusterVolumeProfile(
  clusterId: string,
  volumeId: string,
): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/startprofile`,
    { method: 'POST', body: {} },
  )
}

export async function stopGlusterVolumeProfile(clusterId: string, volumeId: string): Promise<void> {
  await request(
    `/clusters/${encodeURIComponent(clusterId)}/glustervolumes/${encodeURIComponent(
      volumeId,
    )}/stopprofile`,
    { method: 'POST', body: {} },
  )
}
