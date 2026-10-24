import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
vi.mock('../api/transport', async () => {
  const actual = await vi.importActual<typeof import('../api/transport')>('../api/transport')
  return { ...actual, request: (path: string) => request(path) }
})

const { startKeepalive, ACTIVITY_WINDOW_MS, DEFAULT_KEEPALIVE_MS } = await import('./keepalive')
const { ApiError } = await import('../api/transport')

describe('startKeepalive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    request.mockReset().mockResolvedValue({})
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pings while the user is active', () => {
    const idle = vi.fn().mockReturnValue(0)
    const controller = startKeepalive(vi.fn(), DEFAULT_KEEPALIVE_MS, idle)

    vi.advanceTimersByTime(DEFAULT_KEEPALIVE_MS * 3)
    expect(request).toHaveBeenCalledTimes(3)
    controller.stop()
  })

  // The whole point: an abandoned tab must stop holding the engine's own idle
  // expiry open, or the administrator's server-side session policy never bites.
  it('goes quiet once the user is idle, letting the engine expire the session', () => {
    const idle = vi.fn().mockReturnValue(ACTIVITY_WINDOW_MS + 1)
    const controller = startKeepalive(vi.fn(), DEFAULT_KEEPALIVE_MS, idle)

    vi.advanceTimersByTime(DEFAULT_KEEPALIVE_MS * 10)
    expect(request).not.toHaveBeenCalled()
    controller.stop()
  })

  it('resumes as soon as the user comes back', () => {
    let idleMs = ACTIVITY_WINDOW_MS + 1
    const controller = startKeepalive(vi.fn(), DEFAULT_KEEPALIVE_MS, () => idleMs)

    vi.advanceTimersByTime(DEFAULT_KEEPALIVE_MS * 2)
    expect(request).not.toHaveBeenCalled()

    idleMs = 0 // the user touched something
    vi.advanceTimersByTime(DEFAULT_KEEPALIVE_MS)
    expect(request).toHaveBeenCalledTimes(1)
    controller.stop()
  })

  it('a ping that 401s expires the session and stops the timer', async () => {
    request.mockRejectedValue(new ApiError(401, 'Not authenticated'))
    const onExpired = vi.fn()
    startKeepalive(onExpired, DEFAULT_KEEPALIVE_MS, () => 0)

    await vi.advanceTimersByTimeAsync(DEFAULT_KEEPALIVE_MS)
    expect(onExpired).toHaveBeenCalledTimes(1)

    // stopped: no further pings, no repeat callbacks
    await vi.advanceTimersByTimeAsync(DEFAULT_KEEPALIVE_MS * 5)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('a transient error keeps the timer armed', async () => {
    request.mockRejectedValue(new ApiError(503, 'Service unavailable'))
    const onExpired = vi.fn()
    const controller = startKeepalive(onExpired, DEFAULT_KEEPALIVE_MS, () => 0)

    await vi.advanceTimersByTimeAsync(DEFAULT_KEEPALIVE_MS * 3)
    expect(onExpired).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(3)
    controller.stop()
  })
})
