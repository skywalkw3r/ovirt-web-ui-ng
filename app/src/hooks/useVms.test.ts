import { describe, expect, it } from 'vitest'
import { vmPollIntervalMs } from './useVms'

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
})
