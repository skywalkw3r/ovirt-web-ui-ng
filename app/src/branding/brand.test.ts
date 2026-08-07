import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectBrand, readBrandMirror, writeBrandMirror } from './brand'

describe('detectBrand', () => {
  it('defaults to oVirt when product_info is absent', () => {
    expect(detectBrand(undefined)).toBe('ovirt')
    expect(detectBrand(null)).toBe('ovirt')
    expect(detectBrand({})).toBe('ovirt')
  })

  it('detects stock oVirt engines', () => {
    // the mock engine's shape (api/mock/handlers.ts) must resolve to oVirt
    expect(detectBrand({ name: 'oVirt Engine (mock)', vendor: 'ovirt.org' })).toBe('ovirt')
    expect(detectBrand({ name: 'oVirt Engine', vendor: 'ovirt.org' })).toBe('ovirt')
  })

  it('detects OLVM from the Oracle product name', () => {
    expect(detectBrand({ name: 'Oracle Linux Virtualization Manager' })).toBe('olvm')
  })

  it('detects OLVM from the vendor field alone', () => {
    expect(detectBrand({ name: 'Engine', vendor: 'Oracle Corporation' })).toBe('olvm')
  })

  it('matches case-insensitively and on the OLVM initialism', () => {
    expect(detectBrand({ name: 'ORACLE linux virtualization manager' })).toBe('olvm')
    expect(detectBrand({ name: 'OLVM' })).toBe('olvm')
    expect(detectBrand({ vendor: 'olvm' })).toBe('olvm')
  })
})

// vitest runs in a node environment (vite.config.ts) — stub the minimal
// localStorage surface the mirror touches, backed by an in-memory map.
describe('brand mirror', () => {
  let data: Map<string, string>

  beforeEach(() => {
    data = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null for a fresh store', () => {
    expect(readBrandMirror()).toBeNull()
  })

  it('round-trips a written brand', () => {
    writeBrandMirror('olvm')
    expect(readBrandMirror()).toBe('olvm')
    writeBrandMirror('ovirt')
    expect(readBrandMirror()).toBe('ovirt')
  })

  it('rejects a stale or hand-edited value', () => {
    data.set('console-brand', 'oracle-cloud')
    expect(readBrandMirror()).toBeNull()
  })
})
