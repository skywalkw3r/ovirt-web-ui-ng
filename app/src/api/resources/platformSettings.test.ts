import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tag } from '../schemas/tag'
import {
  DEFAULT_PLATFORM_SETTINGS,
  LOGO_CHUNK_CHARS,
  LOGO_CHUNK_PREFIX,
  PLATFORM_TAG_NAME,
  type PlatformMotd,
  type PlatformSettings,
} from '../schemas/platform-settings'
import { createTag, deleteTag, listTags, updateTag } from './tags'
import {
  clearMotdDismissal,
  dismissMotd,
  readDismissedMotd,
  readPlatformMirror,
  savePlatformSettings,
  writePlatformMirror,
} from './platformSettings'

vi.mock('./tags', () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}))

// The vitest environment is plain node (vite.config.ts), so the Web Storage
// globals the mirror/dismissal helpers use don't exist — stub the minimal
// surface with a Map-backed implementation.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}
vi.stubGlobal('localStorage', new MemoryStorage())
vi.stubGlobal('sessionStorage', new MemoryStorage())

const listTagsMock = vi.mocked(listTags)
const createTagMock = vi.mocked(createTag)
const updateTagMock = vi.mocked(updateTag)
const deleteTagMock = vi.mocked(deleteTag)

function tag(id: string, name: string, description?: string): Tag {
  return { id, name, description }
}

function settingsWith(
  overrides: Partial<Omit<PlatformSettings, 'motd'>> & { motd?: Partial<PlatformMotd> },
): PlatformSettings {
  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...overrides,
    motd: { ...DEFAULT_PLATFORM_SETTINGS.motd, ...(overrides.motd ?? {}) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  createTagMock.mockImplementation((name) => Promise.resolve(tag(`created-${name}`, name)))
  updateTagMock.mockImplementation((id) => Promise.resolve(tag(id, PLATFORM_TAG_NAME)))
  deleteTagMock.mockResolvedValue(undefined)
})

describe('savePlatformSettings', () => {
  it('creates the reserved root on a fresh engine, then commits the document', async () => {
    listTagsMock.mockResolvedValue([tag('t1', 'prod'), tag('t2', 'ui.folders')])

    await savePlatformSettings(
      settingsWith({ motd: { enabled: true, severity: 'info', title: '', message: 'hello' } }),
    )

    expect(createTagMock).toHaveBeenCalledWith(PLATFORM_TAG_NAME)
    expect(deleteTagMock).not.toHaveBeenCalled()
    expect(updateTagMock).toHaveBeenCalledTimes(1)
    const [rootId, changes] = updateTagMock.mock.calls[0]
    expect(rootId).toBe(`created-${PLATFORM_TAG_NAME}`)
    expect(JSON.parse(changes.description ?? '')).toMatchObject({
      motd: { enabled: true, message: 'hello' },
      logoChunks: 0,
    })
  })

  it('replaces stale logo chunks and pins the count in the root document last', async () => {
    listTagsMock.mockResolvedValue([
      tag('root-id', PLATFORM_TAG_NAME, '{"logoChunks":1}'),
      tag('old-chunk', `${LOGO_CHUNK_PREFIX}0`, 'data:image/png;base64,OLD'),
    ])
    const order: string[] = []
    deleteTagMock.mockImplementation((id) => {
      order.push(`delete:${id}`)
      return Promise.resolve()
    })
    createTagMock.mockImplementation((name, opts) => {
      order.push(`create:${name}:${opts?.parentId ?? ''}`)
      return Promise.resolve(tag(`created-${name}`, name))
    })
    updateTagMock.mockImplementation((id, changes) => {
      order.push(`update:${id}`)
      return Promise.resolve(tag(id, PLATFORM_TAG_NAME, changes.description))
    })

    const uri = `data:image/png;base64,${'B'.repeat(LOGO_CHUNK_CHARS + 10)}`
    await savePlatformSettings(settingsWith({ logoDataUri: uri }))

    // old chunk removed, two new chunks created as children of the root,
    // and the root PUT is the final call (the commit point)
    expect(order[0]).toBe('delete:old-chunk')
    expect(order).toContain(`create:${LOGO_CHUNK_PREFIX}0:root-id`)
    expect(order).toContain(`create:${LOGO_CHUNK_PREFIX}1:root-id`)
    expect(order[order.length - 1]).toBe('update:root-id')
    const [, changes] = updateTagMock.mock.calls[0]
    expect(JSON.parse(changes.description ?? '')).toMatchObject({ logoChunks: 2 })
  })

  it('propagates engine failures so the mutation can surface them', async () => {
    listTagsMock.mockResolvedValue([tag('root-id', PLATFORM_TAG_NAME)])
    updateTagMock.mockRejectedValue(new Error('engine says no'))
    await expect(savePlatformSettings(DEFAULT_PLATFORM_SETTINGS)).rejects.toThrow('engine says no')
  })
})

describe('platform mirror', () => {
  it('round-trips settings through localStorage', () => {
    const settings = settingsWith({
      motd: { enabled: true, severity: 'danger', title: 'T', message: 'M' },
      productName: 'Acme Cloud',
      supportUrl: 'https://help.example.com/',
      logoDataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
    })
    writePlatformMirror(settings)
    expect(readPlatformMirror()).toEqual(settings)
  })

  it('returns null for an absent or corrupt mirror', () => {
    expect(readPlatformMirror()).toBeNull()
    localStorage.setItem('console-platform-cache', '{corrupt')
    expect(readPlatformMirror()).toBeNull()
  })

  it('sanitizes junk smuggled into the mirror', () => {
    localStorage.setItem(
      'console-platform-cache',
      JSON.stringify({
        motd: { enabled: true, severity: 'info', title: '', message: 'ok' },
        productName: 'fine',
        loginNotice: '',
        supportUrl: 'javascript:alert(1)',
        logoDataUri: 'https://evil.example/steal.png',
      }),
    )
    const mirrored = readPlatformMirror()
    expect(mirrored?.motd.message).toBe('ok')
    expect(mirrored?.supportUrl).toBe('')
    expect(mirrored?.logoDataUri).toBeNull()
  })
})

describe('announcement dismissal', () => {
  it('stores, reads and clears the dismissed signature', () => {
    expect(readDismissedMotd()).toBeNull()
    dismissMotd('abc123')
    expect(readDismissedMotd()).toBe('abc123')
    clearMotdDismissal()
    expect(readDismissedMotd()).toBeNull()
  })
})
