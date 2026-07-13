import { ApiError, request } from '../transport'
import { MacPoolListSchema, MacPoolSchema, type MacPool } from '../schemas/mac-pool'

// MAC address pools are an engine-global collection (/macpools). The admin page
// manages them with full CRUD; the cluster form's MAC Pool select reads the
// same list (it only needs each pool's id+name, a subset of MacPoolSchema).
// 404-tolerant → [] for an engine/mock without the route, matching the other
// top-level option lists (scheduling policies).
export async function listMacPools(): Promise<MacPool[]> {
  try {
    const data = MacPoolListSchema.parse(await request('/macpools'))
    return data.mac_pool ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// Webadmin-style create: POST the new pool's fields. The engine requires a name
// (400 otherwise) and rejects a duplicate name (409); both faults surface
// verbatim via ApiError. Answers with the full created pool, parsed through
// MacPoolSchema so callers (the create modal) get a coerced read model — mirror
// resources/clusters.ts createCluster.
export async function createMacPool(body: Record<string, unknown>): Promise<MacPool> {
  return MacPoolSchema.parse(await request('/macpools', { method: 'POST', body }))
}

// Webadmin-style edit: PUT the changed fields back. The engine answers with the
// full updated pool, parsed through MacPoolSchema so the edit modal gets a
// coerced read model — mirror updateCluster.
export async function updateMacPool(id: string, body: Record<string, unknown>): Promise<MacPool> {
  return MacPoolSchema.parse(
    await request(`/macpools/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  )
}

// Webadmin-style remove: DELETE the pool. The engine answers with an empty body,
// so the promise only needs to settle. The built-in Default pool is not
// removable (the engine 409s it) — the page hides its Remove, so this is only
// reached for user-created pools.
export async function deleteMacPool(id: string): Promise<void> {
  await request(`/macpools/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Payload builder
//
// The MAC-pool form holds a flat draft and hands it here to produce the REST
// body. Centralizing the wire shaping keeps it in one testable place. Unlike the
// cluster builders this is a full create/edit body (not a merge patch): the
// modal always sends name, description, allow_duplicates, and the ranges block,
// so every field is emitted. Ranges ride nested as ranges.range[] — the shape
// the engine's MacPoolMapper reads; blank rows are dropped and each bound is
// trimmed so stray whitespace never reaches the wire.
// ---------------------------------------------------------------------------

export interface MacRangeDraft {
  from: string
  to: string
}

export interface MacPoolDraft {
  name: string
  description: string
  allowDuplicates: boolean
  ranges: MacRangeDraft[]
}

// A range row counts only when at least one bound has content — a fully blank
// row is editor scaffolding, not a range, so it is dropped from the payload.
export function isRangeFilled(range: MacRangeDraft): boolean {
  return range.from.trim() !== '' || range.to.trim() !== ''
}

// Loose MAC-address shape check: six colon-separated hex octet pairs
// (xx:xx:xx:xx:xx:xx). Deliberately light — the engine does the authoritative
// validation (range ordering, overlaps); this just catches obvious typos before
// the round-trip. Empty is treated as "not yet a MAC" and validated by the
// filled-row / required-bound checks instead.
const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i

export function isValidMac(value: string): boolean {
  return MAC_RE.test(value.trim())
}

export function buildMacPoolPayload(draft: MacPoolDraft): Record<string, unknown> {
  const range = draft.ranges
    .filter(isRangeFilled)
    .map((entry) => ({ from: entry.from.trim(), to: entry.to.trim() }))
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    allow_duplicates: draft.allowDuplicates,
    ranges: { range },
  }
}
