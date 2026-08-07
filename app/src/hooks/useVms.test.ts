import { describe, expect, it } from 'vitest'
import { vmListFollow, vmPollIntervalMs, VM_STATISTICS_FOLLOW_MAX } from './useVms'

// The payload-aware poll floor: small installs follow the user cadence
// exactly; large collections floor at the infra (30s) / admin (60s) cadences
// so the unbounded /vms read scales its cost with the payload.
describe('vmPollIntervalMs', () => {
  it('follows the user setting exactly for small installs', () => {
    expect(vmPollIntervalMs(10_000, undefined)).toBe(10_000)
    expect(vmPollIntervalMs(10_000, 0)).toBe(10_000)
    expect(vmPollIntervalMs(10_000, 500)).toBe(10_000)
  })

  it('floors at 30s past 500 VMs and 60s past 2000', () => {
    expect(vmPollIntervalMs(10_000, 501)).toBe(30_000)
    expect(vmPollIntervalMs(10_000, 2000)).toBe(30_000)
    expect(vmPollIntervalMs(10_000, 2001)).toBe(60_000)
  })

  it('never speeds up a slower user setting', () => {
    expect(vmPollIntervalMs(120_000, 5000)).toBe(120_000)
  })

  it('floors at 30s on a deployer-marked WAN engine regardless of count', () => {
    expect(vmPollIntervalMs(10_000, undefined, true)).toBe(30_000)
    expect(vmPollIntervalMs(10_000, 5, true)).toBe(30_000)
    // the size floors still win when they are slower
    expect(vmPollIntervalMs(10_000, 2001, true)).toBe(60_000)
    // and a slower user setting still stands
    expect(vmPollIntervalMs(120_000, 5, true)).toBe(120_000)
  })
})

// The payload-aware follow shape: statistics rides only on provably small
// collections; tags rides always (folder membership and label chips derive
// from it). Unknown count = first load — start light rather than gambling
// the first paint on the heaviest read.
describe('vmListFollow', () => {
  it('starts light while no count is known', () => {
    expect(vmListFollow(undefined)).toBe('tags')
  })

  it('rides statistics while the collection is small', () => {
    expect(vmListFollow(0)).toBe('tags,statistics')
    expect(vmListFollow(VM_STATISTICS_FOLLOW_MAX)).toBe('tags,statistics')
  })

  it('drops statistics past the threshold, keeping tags', () => {
    expect(vmListFollow(VM_STATISTICS_FOLLOW_MAX + 1)).toBe('tags')
    expect(vmListFollow(5000)).toBe('tags')
  })

  it('never rides statistics on a deployer-marked WAN engine, at any size', () => {
    expect(vmListFollow(undefined, true)).toBe('tags')
    expect(vmListFollow(0, true)).toBe('tags')
    expect(vmListFollow(VM_STATISTICS_FOLLOW_MAX, true)).toBe('tags')
  })
})
