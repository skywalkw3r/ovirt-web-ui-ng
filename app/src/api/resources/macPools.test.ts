import { describe, expect, it } from 'vitest'
import { buildMacPoolPayload, isRangeFilled, isValidMac, type MacPoolDraft } from './macPools'

// A submittable draft: a name plus one full range (what the modal gates Save
// on). Tests override single fields from here so each case reads as "this draft
// except …".
function draft(overrides: Partial<MacPoolDraft> = {}): MacPoolDraft {
  return {
    name: 'lab-pool',
    description: '',
    allowDuplicates: false,
    ranges: [{ from: '00:1a:4a:16:01:00', to: '00:1a:4a:16:01:ff' }],
    ...overrides,
  }
}

describe('buildMacPoolPayload', () => {
  it('emits name, description, allow_duplicates, and nested ranges.range[]', () => {
    const body = buildMacPoolPayload(draft({ description: 'dev cap', allowDuplicates: true }))
    expect(body).toEqual({
      name: 'lab-pool',
      description: 'dev cap',
      allow_duplicates: true,
      ranges: { range: [{ from: '00:1a:4a:16:01:00', to: '00:1a:4a:16:01:ff' }] },
    })
  })

  it('trims the name, description, and each range bound', () => {
    const body = buildMacPoolPayload(
      draft({
        name: '  lab-pool  ',
        description: '  spaced  ',
        ranges: [{ from: '  00:1a:4a:16:01:00 ', to: ' 00:1a:4a:16:01:ff  ' }],
      }),
    )
    expect(body.name).toBe('lab-pool')
    expect(body.description).toBe('spaced')
    expect(body.ranges).toEqual({
      range: [{ from: '00:1a:4a:16:01:00', to: '00:1a:4a:16:01:ff' }],
    })
  })

  it('drops fully blank range rows (editor scaffolding) from the payload', () => {
    const body = buildMacPoolPayload(
      draft({
        ranges: [
          { from: '00:1a:4a:16:01:00', to: '00:1a:4a:16:01:ff' },
          { from: '', to: '' },
          { from: '   ', to: '' },
        ],
      }),
    )
    expect((body.ranges as { range: unknown[] }).range).toHaveLength(1)
  })

  it('keeps a partially-filled row so the engine can fault the missing bound', () => {
    // The modal blocks Save on a half-filled row, but the builder must not
    // silently discard it — a present bound means the user intends a range.
    const body = buildMacPoolPayload(draft({ ranges: [{ from: '00:1a:4a:16:01:00', to: '' }] }))
    expect((body.ranges as { range: { from?: string; to?: string }[] }).range).toEqual([
      { from: '00:1a:4a:16:01:00', to: '' },
    ])
  })

  it('emits an empty range block when no rows have content', () => {
    const body = buildMacPoolPayload(draft({ ranges: [{ from: '', to: '' }] }))
    expect(body.ranges).toEqual({ range: [] })
  })
})

describe('isRangeFilled', () => {
  it('is false for a fully blank / whitespace-only row', () => {
    expect(isRangeFilled({ from: '', to: '' })).toBe(false)
    expect(isRangeFilled({ from: '   ', to: '  ' })).toBe(false)
  })

  it('is true as soon as either bound has content', () => {
    expect(isRangeFilled({ from: '00:1a:4a:16:01:00', to: '' })).toBe(true)
    expect(isRangeFilled({ from: '', to: '00:1a:4a:16:01:ff' })).toBe(true)
  })
})

describe('isValidMac', () => {
  it('accepts six colon-separated hex octet pairs, case-insensitively', () => {
    expect(isValidMac('00:1a:4a:16:01:ff')).toBe(true)
    expect(isValidMac('AA:BB:CC:DD:EE:FF')).toBe(true)
    // surrounding whitespace is tolerated (the builder trims before the wire)
    expect(isValidMac('  00:1a:4a:16:01:ff  ')).toBe(true)
  })

  it('rejects wrong length, non-hex, or wrong separators', () => {
    expect(isValidMac('')).toBe(false)
    expect(isValidMac('00:1a:4a:16:01')).toBe(false) // only five octets
    expect(isValidMac('00:1a:4a:16:01:ff:00')).toBe(false) // seven octets
    expect(isValidMac('00-1a-4a-16-01-ff')).toBe(false) // dash separators
    expect(isValidMac('zz:1a:4a:16:01:ff')).toBe(false) // non-hex
    expect(isValidMac('001a.4a16.01ff')).toBe(false) // cisco dotted form
  })
})
