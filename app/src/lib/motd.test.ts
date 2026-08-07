import { beforeEach, describe, expect, it } from 'vitest'
import { clearMotdDismissal, dismissMotd, motdSignature, readDismissedMotd } from './motd'
import type { MotdConfig } from '../config/runtime'

const base: MotdConfig = { severity: 'info', title: 'Maintenance', message: 'Back at 04:00.' }

describe('motdSignature', () => {
  it('tracks every visible field, so an edited announcement resurfaces', () => {
    const sig = motdSignature(base)
    expect(motdSignature({ ...base, message: 'Back at 05:00.' })).not.toBe(sig)
    expect(motdSignature({ ...base, title: 'Outage' })).not.toBe(sig)
    expect(motdSignature({ ...base, severity: 'danger' })).not.toBe(sig)
  })

  it('is stable for identical content', () => {
    expect(motdSignature({ ...base })).toBe(motdSignature(base))
  })

  it('separates fields so a boundary shift cannot collide', () => {
    expect(motdSignature({ ...base, title: 'ab', message: '' })).not.toBe(
      motdSignature({ ...base, title: 'a', message: 'b' }),
    )
  })
})

describe('dismissal', () => {
  beforeEach(() => {
    clearMotdDismissal()
  })

  it('round-trips the dismissed signature and clears on demand', () => {
    expect(readDismissedMotd()).toBeNull()
    dismissMotd(motdSignature(base))
    expect(readDismissedMotd()).toBe(motdSignature(base))
    // AuthProvider.login() calls this so the banner returns at every sign-in
    clearMotdDismissal()
    expect(readDismissedMotd()).toBeNull()
  })
})
