import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/transport'
import type { UserOption } from '../api/resources/userOptions'
import {
  decodeRoamingBlob,
  encodeRoamingBlob,
  mergeOnLoad,
  ROAMING_OPTION_NAME,
  startRoamingSync,
  type RoamedValues,
  type RoamingStatus,
} from './roaming'

const LOCAL: RoamedValues = {
  refreshIntervalMs: 10_000,
  preferredConsole: 'vnc',
  locale: 'en',
  sessionTimeoutMinutes: 60,
  theme: 'dark',
}

const REMOTE: RoamedValues = {
  refreshIntervalMs: 60_000,
  preferredConsole: 'spice',
  locale: 'de',
  sessionTimeoutMinutes: 120,
  theme: 'light',
}

describe('decodeRoamingBlob / encodeRoamingBlob', () => {
  it('round-trips the owned values', () => {
    expect(decodeRoamingBlob(encodeRoamingBlob(REMOTE), LOCAL)).toEqual({
      values: REMOTE,
      extra: {},
    })
  })

  it('validates field by field against the local base', () => {
    const decoded = decodeRoamingBlob(
      JSON.stringify({
        refreshIntervalMs: 100,
        locale: 'xx',
        theme: 'neon',
        preferredConsole: 'spice',
      }),
      LOCAL,
    )
    expect(decoded?.values).toEqual({
      ...LOCAL,
      // too small clamps to the 5s floor; unknown locale/theme keep local
      refreshIntervalMs: 5_000,
      preferredConsole: 'spice',
    })
  })

  it('keeps keys it does not own so a newer console loses nothing', () => {
    const decoded = decodeRoamingBlob(
      JSON.stringify({ ...REMOTE, version: 2, dashboardLayout: ['a', 'b'] }),
      LOCAL,
    )
    expect(decoded?.extra).toEqual({ dashboardLayout: ['a', 'b'] })
    expect(JSON.parse(encodeRoamingBlob(LOCAL, decoded?.extra))).toMatchObject({
      version: 1,
      dashboardLayout: ['a', 'b'],
      refreshIntervalMs: 10_000,
    })
  })

  it('is null for content that is not a JSON object', () => {
    expect(decodeRoamingBlob(undefined, LOCAL)).toBeNull()
    expect(decodeRoamingBlob('{not json', LOCAL)).toBeNull()
    expect(decodeRoamingBlob('[1,2]', LOCAL)).toBeNull()
    expect(decodeRoamingBlob('"text"', LOCAL)).toBeNull()
  })
})

describe('mergeOnLoad', () => {
  it('takes the engine copy when nothing changed locally since sign-in', () => {
    expect(mergeOnLoad(REMOTE, LOCAL, LOCAL)).toEqual(REMOTE)
  })

  it('keeps a field the user changed before the engine read landed', () => {
    const current = { ...LOCAL, preferredConsole: 'spice' as const, theme: 'light' as const }
    const remote = { ...REMOTE, preferredConsole: 'vnc' as const, theme: 'dark' as const }
    expect(mergeOnLoad(remote, current, LOCAL)).toEqual({
      ...remote,
      preferredConsole: 'spice',
      theme: 'light',
    })
  })
})

// A scripted in-memory engine profile plus the local values, standing in for
// the REST calls and the React contexts.
function harness(opts: { options?: UserOption[]; userId?: string | undefined } = {}) {
  let options: UserOption[] = structuredClone(opts.options ?? [])
  let seq = 0
  let local: RoamedValues = { ...LOCAL }
  const statuses: RoamingStatus[] = []
  const calls: string[] = []
  const deps = {
    fetchUserId: vi.fn(async () => ('userId' in opts ? opts.userId : 'u1')),
    list: vi.fn(async (_userId: string) => {
      calls.push('list')
      return structuredClone(options)
    }),
    add: vi.fn(async (_userId: string, name: string, content: string) => {
      calls.push('add')
      if (options.some((o) => o.name === name)) throw new ApiError(400, 'Operation Failed')
      seq += 1
      const created = { id: `new-${seq}`, name, content }
      options.push(created)
      return created
    }),
    remove: vi.fn(async (_userId: string, optionId: string) => {
      calls.push('remove')
      if (!options.some((o) => o.id === optionId)) throw new ApiError(404, 'Not Found')
      options = options.filter((o) => o.id !== optionId)
    }),
    getValues: () => local,
    apply: vi.fn((values: RoamedValues) => {
      local = values
    }),
    onStatus: (status: RoamingStatus) => statuses.push(status),
    debounceMs: 1_000,
  }
  return {
    deps,
    calls,
    statuses,
    setLocal: (patch: Partial<RoamedValues>) => {
      local = { ...local, ...patch }
    },
    getLocal: () => local,
    stored: () => options,
    own: () => options.find((o) => o.name === ROAMING_OPTION_NAME),
    replaceOptions: (next: UserOption[]) => {
      options = next
    },
  }
}

const OTHER_CLIENT: UserOption = { id: 'vp-1', name: 'vmPortal.locale', content: '"fr"' }

describe('startRoamingSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('applies the engine copy at sign-in and writes nothing back', async () => {
    const h = harness({
      options: [
        OTHER_CLIENT,
        { id: 'o1', name: ROAMING_OPTION_NAME, content: encodeRoamingBlob(REMOTE) },
      ],
    })
    const sync = startRoamingSync(h.deps)
    await sync.ready
    expect(h.getLocal()).toEqual(REMOTE)
    expect(h.statuses).toEqual(['roaming'])
    expect(h.calls).toEqual(['list'])
  })

  it('seeds a first-time profile with the local values, leaving other clients alone', async () => {
    const h = harness({ options: [OTHER_CLIENT] })
    const sync = startRoamingSync(h.deps)
    await sync.ready
    expect(h.calls).toEqual(['list', 'add'])
    expect(JSON.parse(h.own()?.content ?? '')).toMatchObject({ version: 1, ...LOCAL })
    expect(h.stored()).toContainEqual(OTHER_CLIENT)
  })

  it('keeps an in-tab change made before the read landed and writes it back', async () => {
    const h = harness({
      options: [{ id: 'o1', name: ROAMING_OPTION_NAME, content: encodeRoamingBlob(REMOTE) }],
    })
    let release: () => void = () => {}
    h.deps.list.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return structuredClone(h.stored())
    })
    const sync = startRoamingSync(h.deps)
    // the user flips the console while the engine read is in flight
    h.setLocal({ preferredConsole: 'vnc', theme: 'light' })
    h.setLocal({ preferredConsole: 'spice' })
    h.setLocal({ refreshIntervalMs: 30_000 })
    await vi.waitFor(() => expect(h.deps.list).toHaveBeenCalled())
    release()
    await sync.ready
    expect(h.getLocal()).toEqual({ ...REMOTE, refreshIntervalMs: 30_000 })
    expect(h.calls).toEqual(['remove', 'add'])
    expect(JSON.parse(h.own()?.content ?? '')).toMatchObject({ refreshIntervalMs: 30_000 })
  })

  it('debounces a burst of changes into one DELETE + POST', async () => {
    const h = harness({
      options: [{ id: 'o1', name: ROAMING_OPTION_NAME, content: encodeRoamingBlob(LOCAL) }],
    })
    const sync = startRoamingSync(h.deps)
    await sync.ready
    h.calls.length = 0

    for (const ms of [5_000, 30_000, 60_000]) {
      h.setLocal({ refreshIntervalMs: ms })
      sync.notifyChange()
      await vi.advanceTimersByTimeAsync(300)
    }
    expect(h.calls).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.calls).toEqual(['remove', 'add'])
    expect(h.own()).toMatchObject({ id: 'new-1' })
    expect(JSON.parse(h.own()?.content ?? '')).toMatchObject({ refreshIntervalMs: 60_000 })

    // the next write deletes the option the last one created
    h.setLocal({ theme: 'light' })
    sync.notifyChange()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.deps.remove).toHaveBeenLastCalledWith('u1', 'new-1')
    expect(h.stored()).toHaveLength(1)
  })

  it('cancels the pending write when the values return to what the engine holds', async () => {
    const h = harness({
      options: [{ id: 'o1', name: ROAMING_OPTION_NAME, content: encodeRoamingBlob(LOCAL) }],
    })
    const sync = startRoamingSync(h.deps)
    await sync.ready
    h.setLocal({ locale: 'fr' })
    sync.notifyChange()
    h.setLocal({ locale: 'en' })
    sync.notifyChange()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(h.calls).toEqual(['list'])
  })

  it('flush writes a pending change at once', async () => {
    const h = harness()
    const sync = startRoamingSync(h.deps)
    await sync.ready
    h.setLocal({ preferredConsole: 'spice' })
    sync.notifyChange()
    await sync.flush()
    expect(JSON.parse(h.own()?.content ?? '')).toMatchObject({ preferredConsole: 'spice' })
  })

  it.each([403, 404])(
    'stays local-only for the session when the read answers %i',
    async (status) => {
      const h = harness()
      h.deps.list.mockRejectedValueOnce(new ApiError(status, 'refused'))
      const sync = startRoamingSync(h.deps)
      await sync.ready
      expect(h.statuses).toEqual(['local'])
      h.setLocal({ theme: 'light' })
      sync.notifyChange()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(h.deps.add).not.toHaveBeenCalled()
      expect(h.deps.apply).not.toHaveBeenCalled()
      // a refusal is expected, not worth a console warning
      expect(console.warn).not.toHaveBeenCalled()
    },
  )

  it('stays local-only when the read fails otherwise, and says why in the console', async () => {
    const h = harness()
    h.deps.list.mockRejectedValueOnce(new ApiError(500, 'boom'))
    const sync = startRoamingSync(h.deps)
    await sync.ready
    expect(h.statuses).toEqual(['local'])
    expect(console.warn).toHaveBeenCalled()
  })

  it('stays local-only when the session has no user id', async () => {
    const h = harness({ userId: undefined })
    const sync = startRoamingSync(h.deps)
    await sync.ready
    expect(h.statuses).toEqual(['local'])
    expect(h.deps.list).not.toHaveBeenCalled()
  })

  it('replaces unparseable content under its own name with the local copy', async () => {
    const h = harness({ options: [{ id: 'o1', name: ROAMING_OPTION_NAME, content: '{oops' }] })
    const sync = startRoamingSync(h.deps)
    await sync.ready
    expect(h.deps.apply).not.toHaveBeenCalled()
    expect(h.calls).toEqual(['list', 'remove', 'add'])
    expect(JSON.parse(h.own()?.content ?? '')).toMatchObject(LOCAL)
  })

  it('replaces a copy another writer re-created between its DELETE and POST', async () => {
    const h = harness({
      options: [{ id: 'o1', name: ROAMING_OPTION_NAME, content: encodeRoamingBlob(LOCAL) }],
    })
    const sync = startRoamingSync(h.deps)
    await sync.ready
    // another tab already replaced o1 with its own o9
    h.replaceOptions([{ id: 'o9', name: ROAMING_OPTION_NAME, content: encodeRoamingBlob(REMOTE) }])
    h.setLocal({ locale: 'ja' })
    sync.notifyChange()
    await vi.advanceTimersByTimeAsync(1_000)
    // remove o1 → 404 (gone), add → duplicate, list, remove o9, add
    expect(h.calls.slice(1)).toEqual(['remove', 'add', 'list', 'remove', 'add'])
    expect(h.stored()).toHaveLength(1)
    expect(JSON.parse(h.own()?.content ?? '')).toMatchObject({ locale: 'ja' })
  })

  it('falls back to local when a write is refused', async () => {
    const h = harness()
    h.deps.add.mockRejectedValueOnce(new ApiError(403, 'Forbidden'))
    const sync = startRoamingSync(h.deps)
    await sync.ready
    expect(h.statuses).toEqual(['roaming', 'local'])
  })

  it('keeps roaming after a transient write failure and retries on the next change', async () => {
    const h = harness()
    h.deps.add.mockRejectedValueOnce(new ApiError(503, 'Unavailable'))
    h.deps.list.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const sync = startRoamingSync(h.deps)
    await sync.ready
    expect(h.statuses).toEqual(['roaming'])
    expect(h.own()).toBeUndefined()
    h.setLocal({ theme: 'light' })
    sync.notifyChange()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(JSON.parse(h.own()?.content ?? '')).toMatchObject({ theme: 'light' })
  })

  it('ignores a read that lands after stop()', async () => {
    const h = harness({
      options: [{ id: 'o1', name: ROAMING_OPTION_NAME, content: encodeRoamingBlob(REMOTE) }],
    })
    const sync = startRoamingSync(h.deps)
    sync.stop()
    await sync.ready
    expect(h.deps.apply).not.toHaveBeenCalled()
    expect(h.statuses).toEqual([])
  })
})
