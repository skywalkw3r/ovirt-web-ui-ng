import { describe, expect, it } from 'vitest'
import { BACKGROUND_POLL_FLOOR_MS, pollIntervalMs } from './pollInterval'

describe('pollIntervalMs', () => {
  it('follows the refresh setting exactly while the control is open', () => {
    expect(pollIntervalMs(5_000, false)).toBe(5_000)
    expect(pollIntervalMs(10_000, false)).toBe(10_000)
    expect(pollIntervalMs(60_000, false)).toBe(60_000)
  })

  it('floors a closed control at the background cadence without slowing a slower setting', () => {
    expect(BACKGROUND_POLL_FLOOR_MS).toBe(30_000)
    expect(pollIntervalMs(5_000, true)).toBe(30_000)
    expect(pollIntervalMs(10_000, true)).toBe(30_000)
    expect(pollIntervalMs(30_000, true)).toBe(30_000)
    expect(pollIntervalMs(60_000, true)).toBe(60_000)
  })
})
