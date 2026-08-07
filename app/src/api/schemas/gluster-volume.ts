import { z } from 'zod'

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
})

// JSON quirk: the "gluster_volume" key is omitted when the list is empty.
export const GlusterVolumeListSchema = z.looseObject({
  gluster_volume: z.array(GlusterVolumeSchema).optional(),
})

export type GlusterVolume = z.infer<typeof GlusterVolumeSchema>
