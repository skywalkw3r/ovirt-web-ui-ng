import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCollapsedFolders, saveCollapsedFolders } from './folderTreePrefs'

const STORAGE_KEY = 'console-folder-tree'

// vitest runs in a node environment (vite.config.ts) — stub the minimal
// localStorage surface folderTreePrefs.ts touches, same as columnPrefs.test.
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

describe('folderTreePrefs', () => {
  it('returns an empty set when nothing is stored', () => {
    expect(loadCollapsedFolders()).toEqual(new Set())
  })

  it('round-trips the collapsed set', () => {
    saveCollapsedFolders(new Set(['tag-prod', 'tag-web']))
    expect(loadCollapsedFolders()).toEqual(new Set(['tag-prod', 'tag-web']))

    saveCollapsedFolders(new Set())
    expect(loadCollapsedFolders()).toEqual(new Set())
  })

  it('degrades malformed JSON and wrong-shaped roots to an empty set', () => {
    for (const raw of ['{not json', '"a string"', '42', 'null', '["tag-prod"]']) {
      data.set(STORAGE_KEY, raw)
      expect(loadCollapsedFolders()).toEqual(new Set())
    }
  })

  it('degrades a wrong-typed collapsed member to an empty set', () => {
    data.set(STORAGE_KEY, JSON.stringify({ collapsed: 'tag-prod' }))
    expect(loadCollapsedFolders()).toEqual(new Set())
  })

  it('drops non-string ids instead of poisoning the set', () => {
    data.set(STORAGE_KEY, JSON.stringify({ collapsed: ['tag-prod', 7, null] }))
    expect(loadCollapsedFolders()).toEqual(new Set(['tag-prod']))
  })
})
