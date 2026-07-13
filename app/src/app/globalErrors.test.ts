import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Notification } from '../notifications/context'
import { GLOBAL_ERROR_THROTTLE_MS, installGlobalErrorHandlers } from './globalErrors'

// The runner uses the 'node' environment, so there is no real window. Stub a
// minimal event target that records listeners and lets tests dispatch to them,
// mirroring the browser API installGlobalErrorHandlers actually wires against.
type Listener = (event: unknown) => void

function createFakeWindow() {
  const listeners = new Map<string, Set<Listener>>()
  const win = {
    addEventListener(type: string, fn: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>()
      set.add(fn)
      listeners.set(type, set)
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn)
    },
    dispatch(type: string, event: unknown = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event)
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0
    },
  }
  return win
}

let win: ReturnType<typeof createFakeWindow>
let notify: ReturnType<typeof vi.fn<(n: Notification) => void>>

beforeEach(() => {
  vi.useFakeTimers()
  win = createFakeWindow()
  vi.stubGlobal('window', win)
  notify = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('installGlobalErrorHandlers', () => {
  it('registers unhandledrejection and error listeners', () => {
    installGlobalErrorHandlers(notify)
    expect(win.listenerCount('unhandledrejection')).toBe(1)
    expect(win.listenerCount('error')).toBe(1)
  })

  it('surfaces a single danger toast on an uncaught error', () => {
    installGlobalErrorHandlers(notify)
    win.dispatch('error')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({ title: 'Something went wrong', variant: 'danger' })
  })

  it('surfaces a toast on an unhandled promise rejection', () => {
    installGlobalErrorHandlers(notify)
    win.dispatch('unhandledrejection')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('throttles a burst of errors into a single toast', () => {
    installGlobalErrorHandlers(notify)
    win.dispatch('error')
    win.dispatch('error')
    win.dispatch('unhandledrejection')
    win.dispatch('error')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('throttles across both event types together', () => {
    installGlobalErrorHandlers(notify)
    win.dispatch('unhandledrejection')
    vi.advanceTimersByTime(GLOBAL_ERROR_THROTTLE_MS - 1)
    win.dispatch('error')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('allows another toast once the throttle window elapses', () => {
    installGlobalErrorHandlers(notify)
    win.dispatch('error')
    vi.advanceTimersByTime(GLOBAL_ERROR_THROTTLE_MS)
    win.dispatch('error')
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('detaches both listeners on teardown', () => {
    const teardown = installGlobalErrorHandlers(notify)
    teardown()
    expect(win.listenerCount('unhandledrejection')).toBe(0)
    expect(win.listenerCount('error')).toBe(0)
    win.dispatch('error')
    expect(notify).not.toHaveBeenCalled()
  })
})
