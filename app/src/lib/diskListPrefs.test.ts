import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOvfStoreDisk, readHideOvfStore, writeHideOvfStore } from './diskListPrefs'

// In-memory localStorage (the vitest environment is node).
let store: Record<string, string>
beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('hide OVF_STORE preference', () => {
  it('hides by default and round-trips an explicit choice', () => {
    expect(readHideOvfStore()).toBe(true)
    writeHideOvfStore(false)
    expect(store['console-disks-hide-ovf-store']).toBe('false')
    expect(readHideOvfStore()).toBe(false)
    writeHideOvfStore(true)
    expect(readHideOvfStore()).toBe(true)
  })

  it('treats junk as the default and survives an unavailable storage', () => {
    store['console-disks-hide-ovf-store'] = 'maybe'
    expect(readHideOvfStore()).toBe(true)
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('lockdown')
      },
      setItem: () => {
        throw new Error('lockdown')
      },
    })
    expect(readHideOvfStore()).toBe(true)
    expect(() => writeHideOvfStore(false)).not.toThrow()
  })
})

describe('isOvfStoreDisk', () => {
  it('matches on the engine content type first, then the fixed name', () => {
    expect(isOvfStoreDisk({ content_type: 'ovf_store', alias: 'renamed' })).toBe(true)
    expect(isOvfStoreDisk({ alias: 'OVF_STORE' })).toBe(true)
    expect(isOvfStoreDisk({ name: 'OVF_STORE' })).toBe(true)
    expect(isOvfStoreDisk({ content_type: 'data', alias: 'web-01_root' })).toBe(false)
    // an alias wins over a stale name, so a user disk called OVF_STORE-ish stays
    expect(
      isOvfStoreDisk({ content_type: 'data', alias: 'ovf_store_backup', name: 'OVF_STORE' }),
    ).toBe(false)
  })
})
