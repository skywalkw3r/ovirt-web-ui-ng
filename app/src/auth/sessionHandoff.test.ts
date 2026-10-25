import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { msSinceActivity, stampActivity } from './activity'
import {
  ACTIVITY_PULSE_MS,
  HANDOFF_TIMEOUT_MS,
  requestSiblingSession,
  serveSiblingSessions,
  type HandoffSession,
} from './sessionHandoff'

const CHANNEL = 'console-session-handoff'

// Same in-process BroadcastChannel stand-in as sessionChannel.test.ts: a post
// reaches every OTHER open instance on the name, never the sender.
class FakeChannel {
  static groups = new Map<string, Set<FakeChannel>>()
  name: string
  listeners = new Set<(e: { data: unknown }) => void>()
  closed = false
  constructor(name: string) {
    this.name = name
    const group = FakeChannel.groups.get(name) ?? new Set()
    group.add(this)
    FakeChannel.groups.set(name, group)
  }
  postMessage(data: unknown) {
    for (const peer of FakeChannel.groups.get(this.name) ?? []) {
      if (peer !== this && !peer.closed) {
        for (const l of peer.listeners) l({ data })
      }
    }
  }
  addEventListener(_type: 'message', l: (e: { data: unknown }) => void) {
    this.listeners.add(l)
  }
  removeEventListener(_type: 'message', l: (e: { data: unknown }) => void) {
    this.listeners.delete(l)
  }
  close() {
    this.closed = true
    FakeChannel.groups.get(this.name)?.delete(this)
  }
}

const SESSION: HandoffSession = {
  token: 'tok-1',
  username: 'admin@internal',
  isAdmin: true,
  serverBase: '',
  sessionId: 'sid-1',
}

const allowAll = { isAllowedBase: () => true }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeChannel.groups.clear()
})

describe('requestSiblingSession', () => {
  it('adopts the session a signed-in sibling offers', async () => {
    const stop = serveSiblingSessions(() => SESSION)
    await expect(requestSiblingSession(allowAll)).resolves.toEqual(SESSION)
    stop()
  })

  it('resolves null after the timeout when no tab is signed in', async () => {
    const pending = requestSiblingSession(allowAll)
    vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })

  it('gets no answer from a sibling that is not signed in', async () => {
    serveSiblingSessions(() => null)
    const pending = requestSiblingSession(allowAll)
    vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })

  it('resolves null without BroadcastChannel', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    await expect(requestSiblingSession(allowAll)).resolves.toBeNull()
  })

  it('ignores an offer for a different request (nonce mismatch)', async () => {
    // a tab that answers every request with a stale nonce
    const rogue = new FakeChannel(CHANNEL)
    rogue.addEventListener('message', () =>
      rogue.postMessage({ type: 'offer', nonce: 'someone-else', ...SESSION }),
    )
    const pending = requestSiblingSession(allowAll)
    vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })

  it('ignores a malformed offer', async () => {
    const rogue = new FakeChannel(CHANNEL)
    rogue.addEventListener('message', (e) => {
      const { nonce } = e.data as { nonce: string }
      rogue.postMessage({ type: 'offer', nonce, ...SESSION, token: '' })
      rogue.postMessage({ type: 'offer', nonce, ...SESSION, isAdmin: 'yes' })
    })
    const pending = requestSiblingSession(allowAll)
    vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })

  it('rejects an offer bound to an engine the deployment does not configure', async () => {
    serveSiblingSessions(() => ({ ...SESSION, serverBase: 'https://elsewhere.example' }))
    const pending = requestSiblingSession({ isAllowedBase: (base) => base === '' })
    vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })

  it('closes its channel once settled', async () => {
    serveSiblingSessions(() => SESSION)
    await requestSiblingSession(allowAll)
    // only the serving tab's channel is left open
    expect(FakeChannel.groups.get(CHANNEL)?.size).toBe(1)
  })
})

describe('serveSiblingSessions', () => {
  it('reads the session at answer time, so a signed-out tab stops answering', async () => {
    let current: HandoffSession | null = SESSION
    serveSiblingSessions(() => current)
    current = null
    const pending = requestSiblingSession(allowAll)
    vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })

  it('stops answering once stopped', async () => {
    const stop = serveSiblingSessions(() => SESSION)
    stop()
    const pending = requestSiblingSession(allowAll)
    vi.advanceTimersByTime(HANDOFF_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })
})

describe('activity pulse', () => {
  it('pulses only after LOCAL activity, to tabs on the same session', () => {
    const otherTab = new FakeChannel(CHANNEL)
    const received: unknown[] = []
    otherTab.addEventListener('message', (e) => received.push(e.data))
    const stop = serveSiblingSessions(() => SESSION)

    stampActivity()
    vi.advanceTimersByTime(ACTIVITY_PULSE_MS)
    expect(received).toEqual([{ type: 'activity', sessionId: 'sid-1' }])

    // no local activity since: no further pulse
    vi.advanceTimersByTime(ACTIVITY_PULSE_MS * 2)
    expect(received).toHaveLength(1)
    stop()
  })

  it("a sibling's pulse on this session resets the idle clock, another session's does not", () => {
    const stop = serveSiblingSessions(() => SESSION)
    const otherTab = new FakeChannel(CHANNEL)

    vi.advanceTimersByTime(10 * 60_000)
    otherTab.postMessage({ type: 'activity', sessionId: 'sid-other' })
    expect(msSinceActivity()).toBeGreaterThanOrEqual(10 * 60_000)

    otherTab.postMessage({ type: 'activity', sessionId: 'sid-1' })
    expect(msSinceActivity()).toBe(0)
    stop()
  })

  it('never re-announces activity it only heard from a sibling (no echo loop)', () => {
    const otherTab = new FakeChannel(CHANNEL)
    const received: unknown[] = []
    otherTab.addEventListener('message', (e) => received.push(e.data))
    const stop = serveSiblingSessions(() => SESSION)

    vi.advanceTimersByTime(ACTIVITY_PULSE_MS * 2) // local clock now stale
    received.length = 0
    otherTab.postMessage({ type: 'activity', sessionId: 'sid-1' })
    vi.advanceTimersByTime(ACTIVITY_PULSE_MS)

    expect(received).toEqual([])
    stop()
  })
})
