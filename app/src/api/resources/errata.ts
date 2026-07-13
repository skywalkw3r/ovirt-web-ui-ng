import { z } from 'zod'
import { ApiError, request } from '../transport'
import { KatelloErratumListSchema, type Erratum } from '../schemas/erratum'

// The single-erratum read model. The list schema (ErratumSchema) carries only
// the fields the table renders; the detail page additionally shows the erratum's
// summary, solution, and the packages that resolve it. Modeled here (not in
// schemas/erratum.ts) alongside the resource that consumes it — the same
// posture as resources/datacenters.ts' inline DataCenterQosSchema. Loose so an
// unmodeled field survives, and numeric scalars coerce from the live engine's
// JSON-string form.
const ErratumPackageSchema = z.looseObject({ name: z.string().optional() })

// oVirt serializes a nested collection as { <singular>: [ … ] } under the
// plural key — packages → { package: [ { name } ] } — the same shape NicListSchema
// models. The key is omitted entirely when the erratum lists no packages.
export const ErratumDetailSchema = z.looseObject({
  id: z.string(),
  title: z.string().optional(),
  // advisory identifier, e.g. 'RHSA-2026:1234'
  name: z.string().optional(),
  // 'security' | 'bugfix' | 'enhancement' — open string
  type: z.string().optional(),
  severity: z.string().optional(),
  // epoch ms; the live engine serializes numeric scalars as JSON strings
  issued: z.coerce.number().optional(),
  // one-line synopsis and the remediation prose
  summary: z.string().optional(),
  solution: z.string().optional(),
  packages: z.looseObject({ package: z.array(ErratumPackageSchema).optional() }).optional(),
})

export type ErratumDetail = z.infer<typeof ErratumDetailSchema>

// Usually empty: the engine only aggregates errata when a Foreman/Satellite
// (Katello) provider is configured (ErrataPage's empty state says exactly
// that). Engines WITHOUT one don't just return an empty list — bare
// OLVM/oVirt 4.5 engines answer HTTP 400 for the whole collection (404 on
// some versions). That's "errata not available here", not a failure, so it
// maps to the empty list and the page's informative empty state — and the
// page lights up automatically if a Satellite provider is added later.
// Anything else (auth, 5xx, network) still throws to the error state.
export async function listErrata(): Promise<Erratum[]> {
  try {
    const data = KatelloErratumListSchema.parse(await request('/katelloerrata'))
    return data.katello_erratum ?? []
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
      return []
    }
    throw error
  }
}

// GET /katelloerrata/{id} — one erratum by id (KatelloErratumService.Get). Unlike
// the collection, a single-resource read is not swallowed: a caller only reaches
// here from a link row that already resolved, so a 404 is a genuine "this erratum
// is gone" the detail page surfaces as its error state, not the empty aggregate.
export async function getErratum(id: string): Promise<ErratumDetail> {
  return ErratumDetailSchema.parse(await request(`/katelloerrata/${encodeURIComponent(id)}`))
}
