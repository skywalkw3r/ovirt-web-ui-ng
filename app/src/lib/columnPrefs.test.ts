import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearColumnPrefs,
  loadColumnPrefs,
  loadColumnWidths,
  saveColumnPrefs,
  saveColumnWidths,
} from './columnPrefs'

const STORAGE_KEY = 'console-columns'

// vitest runs in a node environment (vite.config.ts) — stub the minimal
// localStorage surface columnPrefs.ts touches, backed by an in-memory map.
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

describe('loadColumnPrefs', () => {
  it('returns null for a fresh store', () => {
    expect(loadColumnPrefs('storage-domains')).toBeNull()
  })

  it('returns null for an unknown area', () => {
    saveColumnPrefs('storage-domains', ['name', 'type'])
    expect(loadColumnPrefs('vms')).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    data.set(STORAGE_KEY, 'not json{{')
    expect(loadColumnPrefs('storage-domains')).toBeNull()
  })

  it('treats a non-object root as empty', () => {
    data.set(STORAGE_KEY, JSON.stringify(['not', 'an', 'object']))
    expect(loadColumnPrefs('storage-domains')).toBeNull()
  })

  it('drops wrong-shaped entries but keeps valid ones', () => {
    data.set(
      STORAGE_KEY,
      JSON.stringify({
        'storage-domains': ['name', 42, null, 'type'],
        vms: 'not an array',
      }),
    )
    expect(loadColumnPrefs('storage-domains')).toEqual(['name', 'type'])
    expect(loadColumnPrefs('vms')).toBeNull()
  })
})

describe('saveColumnPrefs', () => {
  it('round-trips through localStorage', () => {
    saveColumnPrefs('storage-domains', ['name', 'type', 'status'])
    expect(loadColumnPrefs('storage-domains')).toEqual(['name', 'type', 'status'])
  })

  it('overwrites a previous preference for the same area', () => {
    saveColumnPrefs('storage-domains', ['name', 'type'])
    saveColumnPrefs('storage-domains', ['name'])
    expect(loadColumnPrefs('storage-domains')).toEqual(['name'])
  })

  it('keeps areas independent', () => {
    saveColumnPrefs('storage-domains', ['name', 'type'])
    saveColumnPrefs('vms', ['name', 'status'])
    expect(loadColumnPrefs('storage-domains')).toEqual(['name', 'type'])
    expect(loadColumnPrefs('vms')).toEqual(['name', 'status'])
  })

  it('recovers from malformed storage by starting fresh', () => {
    data.set(STORAGE_KEY, '{broken')
    saveColumnPrefs('storage-domains', ['name'])
    expect(loadColumnPrefs('storage-domains')).toEqual(['name'])
  })

  it('persists an empty list as a preference, not as null', () => {
    saveColumnPrefs('storage-domains', [])
    expect(loadColumnPrefs('storage-domains')).toEqual([])
  })
})

describe('legacy store migration', () => {
  it('reads a pre-widths bare-array area as its visible keys', () => {
    data.set(STORAGE_KEY, JSON.stringify({ vms: ['name', 'status'] }))
    expect(loadColumnPrefs('vms')).toEqual(['name', 'status'])
    expect(loadColumnWidths('vms')).toEqual({})
  })

  it('upgrades a legacy area in place when widths are saved onto it', () => {
    data.set(STORAGE_KEY, JSON.stringify({ vms: ['name', 'status'] }))
    saveColumnWidths('vms', { name: 320 })
    expect(loadColumnPrefs('vms')).toEqual(['name', 'status'])
    expect(loadColumnWidths('vms')).toEqual({ name: 320 })
  })
})

describe('column widths', () => {
  it('returns an empty map for a fresh store', () => {
    expect(loadColumnWidths('vms')).toEqual({})
  })

  it('round-trips through localStorage', () => {
    saveColumnWidths('vms', { name: 320, status: 90 })
    expect(loadColumnWidths('vms')).toEqual({ name: 320, status: 90 })
  })

  it('keeps widths and visibility independent within an area', () => {
    saveColumnPrefs('vms', ['name'])
    saveColumnWidths('vms', { name: 320 })
    saveColumnPrefs('vms', ['name', 'status'])
    expect(loadColumnWidths('vms')).toEqual({ name: 320 })
    expect(loadColumnPrefs('vms')).toEqual(['name', 'status'])
  })

  it('drops junk width entries individually', () => {
    data.set(
      STORAGE_KEY,
      JSON.stringify({
        vms: { widths: { name: 320, status: 'wide', uptime: -4, host: null } },
      }),
    )
    expect(loadColumnWidths('vms')).toEqual({ name: 320 })
  })

  it('an empty width map removes the field and an all-empty area drops out', () => {
    saveColumnWidths('vms', { name: 320 })
    saveColumnWidths('vms', {})
    expect(loadColumnWidths('vms')).toEqual({})
    expect(data.get(STORAGE_KEY)).not.toContain('vms')
  })
})

describe('clearColumnPrefs', () => {
  it('removes the preference so load falls back to null', () => {
    saveColumnPrefs('storage-domains', ['name', 'type'])
    clearColumnPrefs('storage-domains')
    expect(loadColumnPrefs('storage-domains')).toBeNull()
  })

  it('drops the widths with the visibility (Reset restores the stock grid)', () => {
    saveColumnPrefs('vms', ['name'])
    saveColumnWidths('vms', { name: 320 })
    clearColumnPrefs('vms')
    expect(loadColumnPrefs('vms')).toBeNull()
    expect(loadColumnWidths('vms')).toEqual({})
  })

  it('leaves other areas untouched', () => {
    saveColumnPrefs('storage-domains', ['name', 'type'])
    saveColumnPrefs('vms', ['name', 'status'])
    clearColumnPrefs('storage-domains')
    expect(loadColumnPrefs('storage-domains')).toBeNull()
    expect(loadColumnPrefs('vms')).toEqual(['name', 'status'])
  })

  it('is a no-op for an unknown area', () => {
    saveColumnPrefs('vms', ['name'])
    clearColumnPrefs('storage-domains')
    expect(loadColumnPrefs('vms')).toEqual(['name'])
  })
})
