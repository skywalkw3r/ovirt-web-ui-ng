import type { MacPool } from '../../api/schemas/mac-pool'
import type { MacPoolDraft, MacRangeDraft } from '../../api/resources/macPools'

// The flat, always-defined draft the MAC-pool modal owns. Optional wire scalars
// collapse to '' / false / [] so every input stays controlled. The payload
// builder + range validators live beside the resource (api/resources/macPools);
// this module only handles read-model → draft seeding, blank defaults, and the
// stable row ids the ranges editor keys on, so the modal file stays
// component-only (Fast-refresh only-export-components).

// A range row carries a stable id for its React key (add/remove must not
// re-key surviving rows), on top of the from/to the payload builder reads.
export interface MacRangeRow extends MacRangeDraft {
  id: string
}

// The modal works with row-shaped ranges; the payload builder only reads
// from/to, so the id is dropped at the boundary.
export interface MacPoolFormDraft extends Omit<MacPoolDraft, 'ranges'> {
  ranges: MacRangeRow[]
}

let rangeRowSeq = 0
const nextRangeId = () => `mac-range-${rangeRowSeq++}`

export function blankRange(): MacRangeRow {
  return { id: nextRangeId(), from: '', to: '' }
}

// MacPool read model → fully-populated draft. Every optional field gets a
// concrete fallback so the draft has no undefined members. A pool with no ranges
// still shows one blank row so the editor is never empty (at least one range is
// required to save).
export function poolToDraft(pool: MacPool): MacPoolFormDraft {
  const ranges = (pool.ranges?.range ?? []).map((range) => ({
    id: nextRangeId(),
    from: range.from ?? '',
    to: range.to ?? '',
  }))
  return {
    name: pool.name ?? '',
    description: pool.description ?? '',
    allowDuplicates: pool.allow_duplicates === true,
    ranges: ranges.length > 0 ? ranges : [blankRange()],
  }
}

// Blank create-mode defaults: no name/description, duplicates disallowed (the
// engine default), and a single empty range row to fill in.
export function blankDraft(): MacPoolFormDraft {
  return {
    name: '',
    description: '',
    allowDuplicates: false,
    ranges: [blankRange()],
  }
}
