import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithFollowFallback, isFollowDenied, resetFollowDenials } from './followDegrade'
import { ApiError } from './transport'

describe('fetchWithFollowFallback', () => {
  afterEach(() => {
    resetFollowDenials()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the follow read when it succeeds', async () => {
    const bare = vi.fn()
    await expect(fetchWithFollowFallback('k', async () => 'followed', bare)).resolves.toBe(
      'followed',
    )
    expect(bare).not.toHaveBeenCalled()
    expect(isFollowDenied('k')).toBe(false)
  })

  it('degrades to the bare read on a 5xx and remembers the denial', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const follow = vi.fn().mockRejectedValue(new ApiError(500, 'boom'))
    await expect(fetchWithFollowFallback('k', follow, async () => 'bare')).resolves.toBe('bare')
    expect(isFollowDenied('k')).toBe(true)
    await expect(fetchWithFollowFallback('k', follow, async () => 'bare2')).resolves.toBe('bare2')
    expect(follow).toHaveBeenCalledTimes(1)
  })

  it('propagates non-5xx errors without denying', async () => {
    const follow = vi.fn().mockRejectedValue(new ApiError(404, 'missing'))
    await expect(fetchWithFollowFallback('k', follow, async () => 'bare')).rejects.toMatchObject({
      status: 404,
    })
    expect(isFollowDenied('k')).toBe(false)
  })

  it('expires the denial after the TTL', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const follow = vi.fn().mockRejectedValue(new ApiError(503, 'busy'))
    await fetchWithFollowFallback('k', follow, async () => 'bare')
    expect(isFollowDenied('k')).toBe(true)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(isFollowDenied('k')).toBe(false)
  })
})
