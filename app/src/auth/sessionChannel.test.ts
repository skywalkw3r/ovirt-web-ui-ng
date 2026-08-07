import { afterEach, describe, expect, it, vi } from 'vitest'
import { broadcastLogout, onLogoutBroadcast, resetSessionChannelForTests } from './sessionChannel'

// Must match the module's localStorage ping key.
const LOGOUT_STORAGE_KEY = 'ovirt-console-logout-ping'

// A tiny in-process BroadcastChannel: every instance on the same name shares
// one group, and a post reaches every OTHER instance (never the sender) — the
// same-origin, cross-document contract the real one gives us. The node vitest
// env has no BroadcastChannel, so we stand one up. This tab's module uses ONE
// long-lived channel (send + receive); a SEPARATE FakeChannel instance stands
// in for "another tab".
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

// A fake window + localStorage so the storage-event transport can be exercised
// in the node env (which has neither by default, so hasStorage() is false and
// only the BroadcastChannel path runs — exactly today's behaviour).
function fakeStorageEnv() {
  const storageListeners = new Set<(e: { key: string | null; newValue: string | null }) => void>()
  const map = new Map<string, string>()
  const win = {
    addEventListener: (type: string, l: (e: never) => void) => {
      if (type === 'storage') storageListeners.add(l as never)
    },
    removeEventListener: (type: string, l: (e: never) => void) => {
      if (type === 'storage') storageListeners.delete(l as never)
    },
  }
  const localStorageStub = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
  return {
    install() {
      vi.stubGlobal('window', win)
      vi.stubGlobal('localStorage', localStorageStub)
    },
    // Simulate the browser firing `storage` in OTHER tabs after a write here.
    fireStorage(key: string | null, newValue: string | null) {
      for (const l of storageListeners) l({ key, newValue })
    },
    read: (k: string) => map.get(k) ?? null,
    listenerCount: () => storageListeners.size,
  }
}

afterEach(() => {
  resetSessionChannelForTests()
  vi.unstubAllGlobals()
  FakeChannel.groups.clear()
})

describe('sessionChannel — BroadcastChannel transport', () => {
  it("delivers another tab's sign-out to this tab's subscriber", () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const handler = vi.fn()
    onLogoutBroadcast(handler) // creates this tab's one channel + listener

    // another tab signs out
    new FakeChannel('console-session').postMessage('logout')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("broadcastLogout reaches another tab's subscriber", () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const otherTab = new FakeChannel('console-session')
    const received: unknown[] = []
    otherTab.addEventListener('message', (e) => received.push(e.data))

    broadcastLogout()

    expect(received).toEqual(['logout'])
  })

  it('does NOT echo a broadcast back to the signing tab itself', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const handler = vi.fn()
    onLogoutBroadcast(handler)

    broadcastLogout() // same tab both sends and listens → must not self-fire

    expect(handler).not.toHaveBeenCalled()
  })

  it('stops delivering after unsubscribe', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const handler = vi.fn()
    const unsubscribe = onLogoutBroadcast(handler)
    unsubscribe()

    new FakeChannel('console-session').postMessage('logout')
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores unrelated messages', () => {
    vi.stubGlobal('BroadcastChannel', FakeChannel)
    const handler = vi.fn()
    onLogoutBroadcast(handler)

    new FakeChannel('console-session').postMessage('not-logout')
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('sessionChannel — localStorage fallback', () => {
  it('writes a changing ping value on every broadcast', () => {
    vi.stubGlobal('BroadcastChannel', undefined) // force the fallback to matter
    const env = fakeStorageEnv()
    env.install()

    broadcastLogout()
    const first = env.read(LOGOUT_STORAGE_KEY)
    broadcastLogout()
    const second = env.read(LOGOUT_STORAGE_KEY)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    // a repeat logout must CHANGE the value, else no storage event fires
    expect(second).not.toBe(first)
  })

  it("fires the handler on another tab's storage ping, but not on unrelated keys or clears", () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const env = fakeStorageEnv()
    env.install()
    const handler = vi.fn()
    onLogoutBroadcast(handler)

    env.fireStorage('some-other-key', 'x') // unrelated
    env.fireStorage(LOGOUT_STORAGE_KEY, null) // a clear / removeItem
    expect(handler).not.toHaveBeenCalled()

    env.fireStorage(LOGOUT_STORAGE_KEY, '123.456') // a real ping
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('removes the storage listener on unsubscribe', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const env = fakeStorageEnv()
    env.install()
    const unsubscribe = onLogoutBroadcast(vi.fn())
    expect(env.listenerCount()).toBe(1)
    unsubscribe()
    expect(env.listenerCount()).toBe(0)
  })
})

describe('sessionChannel — graceful degradation', () => {
  // No BroadcastChannel and no window/localStorage (the node-env default):
  // degrades to per-tab sign-out rather than throwing.
  it('is a no-op when neither transport is available', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const unsubscribe = onLogoutBroadcast(vi.fn())
    expect(() => broadcastLogout()).not.toThrow()
    expect(() => unsubscribe()).not.toThrow()
  })
})
