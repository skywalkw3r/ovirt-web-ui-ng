import { z } from 'zod'

export const ErratumSchema = z.looseObject({
  id: z.string(),
  title: z.string().optional(),
  // advisory identifier, e.g. 'RHSA-2026:1234'
  name: z.string().optional(),
  // 'security' | 'bugfix' | 'enhancement' — open string, same rationale as
  // vm status
  type: z.string().optional(),
  severity: z.string().optional(),
  // epoch ms; the live engine serializes numeric scalars as JSON strings
  issued: z.coerce.number().optional(),
})

// JSON quirk: the "katello_erratum" key is omitted when the list is empty —
// the usual case, since the engine only aggregates errata when a
// Satellite/Katello provider is configured.
export const KatelloErratumListSchema = z.looseObject({
  katello_erratum: z.array(ErratumSchema).optional(),
})

export type Erratum = z.infer<typeof ErratumSchema>
