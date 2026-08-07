import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks'

const STORAGE_KEY = 'console-bookmarks'

// vitest runs in a node environment (vite.config.ts) — stub the minimal
// localStorage surface bookmarks.ts touches, backed by an in-memory map.
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

describe('listBookmarks', () => {
  it('returns [] for a fresh store', () => {
    expect(listBookmarks('vms')).toEqual([])
  })

  it('returns [] for an unknown area', () => {
    saveBookmark('vms', { name: 'up', query: 'status=up' })
    expect(listBookmarks('events')).toEqual([])
  })

  it('returns {} semantics on malformed JSON', () => {
    data.set(STORAGE_KEY, 'not json{{')
    expect(listBookmarks('vms')).toEqual([])
  })

  it('treats a non-object root as empty', () => {
    data.set(STORAGE_KEY, JSON.stringify(['not', 'an', 'object']))
    expect(listBookmarks('vms')).toEqual([])
  })

  it('drops wrong-shaped entries but keeps valid ones', () => {
    data.set(
      STORAGE_KEY,
      JSON.stringify({
        vms: [{ name: 'ok', query: 'status=up' }, { name: 42, query: 'nope' }, 'garbage', null],
        events: 'not an array',
      }),
    )
    expect(listBookmarks('vms')).toEqual([{ name: 'ok', query: 'status=up' }])
    expect(listBookmarks('events')).toEqual([])
  })
})

describe('saveBookmark', () => {
  it('round-trips through localStorage', () => {
    const returned = saveBookmark('vms', { name: 'up', query: 'status=up' })
    expect(returned).toEqual([{ name: 'up', query: 'status=up' }])
    expect(listBookmarks('vms')).toEqual(returned)
  })

  it('appends new names in order', () => {
    saveBookmark('vms', { name: 'a', query: 'status=up' })
    const returned = saveBookmark('vms', { name: 'b', query: 'status=down' })
    expect(returned.map((bookmark) => bookmark.name)).toEqual(['a', 'b'])
  })

  it('upserts by name, keeping position', () => {
    saveBookmark('vms', { name: 'a', query: 'status=up' })
    saveBookmark('vms', { name: 'b', query: 'status=down' })
    const returned = saveBookmark('vms', { name: 'a', query: 'name=web*' })
    expect(returned).toEqual([
      { name: 'a', query: 'name=web*' },
      { name: 'b', query: 'status=down' },
    ])
    expect(listBookmarks('vms')).toEqual(returned)
  })

  it('keeps areas independent', () => {
    saveBookmark('vms', { name: 'up', query: 'status=up' })
    saveBookmark('events', { name: 'errors', query: 'severity=error' })
    expect(listBookmarks('vms')).toEqual([{ name: 'up', query: 'status=up' }])
    expect(listBookmarks('events')).toEqual([{ name: 'errors', query: 'severity=error' }])
  })

  it('recovers from malformed storage by starting fresh', () => {
    data.set(STORAGE_KEY, '{broken')
    const returned = saveBookmark('vms', { name: 'up', query: 'status=up' })
    expect(returned).toEqual([{ name: 'up', query: 'status=up' }])
    expect(listBookmarks('vms')).toEqual(returned)
  })
})

describe('removeBookmark', () => {
  it('removes by name and persists', () => {
    saveBookmark('vms', { name: 'a', query: 'status=up' })
    saveBookmark('vms', { name: 'b', query: 'status=down' })
    const returned = removeBookmark('vms', 'a')
    expect(returned).toEqual([{ name: 'b', query: 'status=down' }])
    expect(listBookmarks('vms')).toEqual(returned)
  })

  it('is a no-op for an unknown name', () => {
    saveBookmark('vms', { name: 'a', query: 'status=up' })
    expect(removeBookmark('vms', 'missing')).toEqual([{ name: 'a', query: 'status=up' }])
  })

  it('leaves other areas untouched', () => {
    saveBookmark('vms', { name: 'up', query: 'status=up' })
    saveBookmark('events', { name: 'errors', query: 'severity=error' })
    removeBookmark('vms', 'up')
    expect(listBookmarks('vms')).toEqual([])
    expect(listBookmarks('events')).toEqual([{ name: 'errors', query: 'severity=error' }])
  })
})
