import { z } from 'zod'

// A single MAC-address range: an inclusive from/to pair (GET .../macpools/{id}
// carries them nested under ranges.range[]). Both bounds are engine strings
// (xx:xx:xx:xx:xx:xx). The engine omits the inner "range" array key when a pool
// has no ranges defined — mirror the empty-key discipline the other schemas use.
export const MacRangeSchema = z.looseObject({
  from: z.string().optional(),
  to: z.string().optional(),
})

// The richer MAC-pool read model the admin page manages. A superset of the lean
// { id, name } the cluster MAC-pool select needs, so clusters.ts re-exports this
// and that consumer keeps working unchanged. The live engine serializes the two
// booleans as JSON strings, so both forms are coerced (mirror the cluster
// affinity-rule flags). default_pool marks the built-in Default pool, which the
// engine forbids deleting — the page keys its un-removable Remove off this.
export const MacPoolSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  allow_duplicates: z.union([z.boolean(), z.stringbool()]).optional(),
  default_pool: z.union([z.boolean(), z.stringbool()]).optional(),
  // JSON quirk: the inner "range" key is omitted when the pool has no ranges.
  ranges: z.looseObject({ range: z.array(MacRangeSchema).optional() }).optional(),
})

// JSON quirk: the "mac_pool" key is omitted when the collection is empty.
export const MacPoolListSchema = z.looseObject({
  mac_pool: z.array(MacPoolSchema).optional(),
})

export type MacRange = z.infer<typeof MacRangeSchema>
export type MacPool = z.infer<typeof MacPoolSchema>
