import { afterEach, describe, expect, it, vi } from 'vitest'
import { broadcastLogout, onLogoutBroadcast } from './sessionChannel'

// A tiny in-process BroadcastChannel: every instance on the same name shares
// one listener set, and a post reaches every OTHER instance (never the sender)
// — the same-origin, cross-document contract the real one gives us. The node
// vitest env has no BroadcastChannel, so we stand one up.
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

afterEach(() => {
  vi.unstubAllGlobals()
  FakeChannel.groups.clear()
})

describe('sessionChannel', () => {
  it('delivers a sign-out to every OTHER subscriber, not the broadcaster', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const tabA = vi.fn()
    const tabB = vi.fn()
    onLogoutBroadcast(tabA)
    onLogoutBroadcast(tabB)

    broadcastLogout()

    expect(tabA).toHaveBeenCalledTimes(1)
    expect(tabB).toHaveBeenCalledTimes(1)
  })

  it('stops delivering after unsubscribe', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const handler = vi.fn()
    const unsubscribe = onLogoutBroadcast(handler)
    unsubscribe()

    broadcastLogout()
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores unrelated messages on the channel', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const handler = vi.fn()
    onLogoutBroadcast(handler)

    // something else posts on the same channel name
    new FakeChannel('console-session').postMessage('not-logout')
    expect(handler).not.toHaveBeenCalled()
  })

  // Degrades to today's per-tab sign-out rather than throwing where the API is
  // absent (older Safari, some embeddings).
  it('is a no-op when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const unsubscribe = onLogoutBroadcast(vi.fn())
    expect(() => broadcastLogout()).not.toThrow()
    expect(() => unsubscribe()).not.toThrow()
  })
})
