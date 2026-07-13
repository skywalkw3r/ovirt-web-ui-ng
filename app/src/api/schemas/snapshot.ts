import { z } from 'zod'

// the live engine serializes booleans as strings ("true"/"false")
const BooleanishSchema = z.union([z.boolean(), z.stringbool()])

export const SnapshotSchema = z.looseObject({
  id: z.string(),
  description: z.string().optional(),
  // 'ok' | 'locked' | 'in_preview' — open string, same rationale as vm status
  snapshot_status: z.string().optional(),
  // 'active' | 'regular' | 'preview' | 'stateless'; the engine always keeps
  // one 'active' snapshot per VM that cannot be restored or deleted
  snapshot_type: z.string().optional(),
  // epoch ms; the live engine serializes numeric scalars as JSON strings
  date: z.coerce.number().optional(),
  persist_memorystate: BooleanishSchema.optional(),
})

// JSON quirk: GET /vms/{id}/snapshots returns { snapshot: [...] } and omits
// the "snapshot" key entirely when the list is empty.
export const SnapshotListSchema = z.looseObject({
  snapshot: z.array(SnapshotSchema).optional(),
})

export type Snapshot = z.infer<typeof SnapshotSchema>
