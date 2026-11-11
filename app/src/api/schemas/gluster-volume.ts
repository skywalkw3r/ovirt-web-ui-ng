import { z } from 'zod'
import { VmStatSchema } from './statistic'

export const GlusterVolumeSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  comment: z.string().optional(),
  // 'replicate' | 'distribute' | 'distributed_replicate' | ... — open
  // string, same rationale as vm status
  volume_type: z.string().optional(),
  // 'up' | 'down' | 'unknown' — open string
  status: z.string().optional(),
  // bare link back to the owning cluster — only the id is modeled
  cluster: z.looseObject({ id: z.string().optional() }).optional(),
  // JSON list wrapper, same quirk as the top-level collections:
  // { transport_type: ['tcp', 'rdma'] }
  transport_types: z.looseObject({ transport_type: z.array(z.string()).optional() }).optional(),
  // topology counts ride inline on the flat list (GlusterVolumeMapper maps
  // them unconditionally); the live engine serializes numbers as strings
  replica_count: z.coerce.number().optional(),
  disperse_count: z.coerce.number().optional(),
  redundancy_count: z.coerce.number().optional(),
  stripe_count: z.coerce.number().optional(),
  // Present when the read used ?follow=statistics (listGlusterVolumes does):
  // VolumeStatisticalQuery's memory.total.size / memory.used.size /
  // memory.free.size byte gauges from the engine's stored capacity details.
  // An empty wrapper when the engine has no capacity info for the volume yet.
  // Same wire shape as the VM/host statistics inline.
  statistics: z.looseObject({ statistic: z.array(VmStatSchema).optional() }).optional(),
})

// Space used / total bytes off the followed statistics; undefined when the
// statistics were not followed (denied) or carry no capacity yet.
export function glusterVolumeCapacity(
  volume: GlusterVolume,
): { used: number; total: number } | undefined {
  const stats = volume.statistics?.statistic ?? []
  const gauge = (name: string) =>
    stats.find((stat) => stat.name === name)?.values?.value?.[0]?.datum
  const used = gauge('memory.used.size')
  const total = gauge('memory.total.size')
  return used === undefined || total === undefined || total <= 0 ? undefined : { used, total }
}

// JSON quirk: the "gluster_volume" key is omitted when the list is empty.
export const GlusterVolumeListSchema = z.looseObject({
  gluster_volume: z.array(GlusterVolumeSchema).optional(),
})

export type GlusterVolume = z.infer<typeof GlusterVolumeSchema>
