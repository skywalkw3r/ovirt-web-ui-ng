import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startIdleWatcher } from './idle-watcher'

// node's bare EventTarget stands in for window — the watcher only needs
// add/removeEventListener + dispatchEvent (same seam the hook passes).
describe('startIdleWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires after the configured idle period', () => {
    const onTimeout = vi.fn()
    const target = new EventTarget()
    const watcher = startIdleWatcher(30, onTimeout, target)

    // 29 minutes of silence: below the threshold, nothing fires
    vi.advanceTimersByTime(29 * 60_000)
    expect(onTimeout).not.toHaveBeenCalled()

    // crossing 30 minutes: the 30s sweep catches it
    vi.advanceTimersByTime(90_000)
    expect(onTimeout).toHaveBeenCalled()
    watcher.stop()
  })

  it('activity resets the idle clock', () => {
    const onTimeout = vi.fn()
    const target = new EventTarget()
    const watcher = startIdleWatcher(30, onTimeout, target)

    vi.advanceTimersByTime(25 * 60_000)
    target.dispatchEvent(new Event('keydown'))
    // 25 more minutes: only 25 since the keydown, still under 30
    vi.advanceTimersByTime(25 * 60_000)
    expect(onTimeout).not.toHaveBeenCalled()

    // silence past the threshold from the last activity
    vi.advanceTimersByTime(6 * 60_000)
    expect(onTimeout).toHaveBeenCalled()
    watcher.stop()
  })

  it('stop() disarms both the listeners and the sweep', () => {
    const onTimeout = vi.fn()
    const target = new EventTarget()
    const watcher = startIdleWatcher(30, onTimeout, target)
    watcher.stop()

    vi.advanceTimersByTime(3 * 60 * 60_000)
    expect(onTimeout).not.toHaveBeenCalled()
    // a post-stop event must not throw or re-arm anything
    target.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(3 * 60 * 60_000)
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
