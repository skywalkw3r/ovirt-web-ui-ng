// @vitest-environment jsdom
import '../test/shims'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// This hook short-circuits to "always reachable" under VITE_MOCK (the in-memory
// engine never fails the way a dead one does), so unlike the other jsdom specs
// it does NOT import ../test/env. The env is pinned to the real code path and
// the module is imported only afterwards, because IS_MOCK is read at module
// scope. No mock engine is involved: reachability is derived purely from the
// QueryClient cache and the browser's online events.
vi.stubEnv('VITE_MOCK', '')
const { useEngineReachable, UNREACHABLE_THRESHOLD } = await import('./useEngineReachable')

afterEach(cleanup)

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const rendered = renderHook(() => useEngineReachable(), { wrapper })
  let seq = 0
  // one settled query each — a distinct key per call so every fetch is a fresh
  // observation, the way independent poll queries hit the cache
  const fail = () =>
    act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ['probe', ++seq],
          queryFn: () => Promise.reject(new Error('down')),
        })
        .catch(() => undefined)
    })
  const succeed = () =>
    act(async () => {
      await queryClient.fetchQuery({ queryKey: ['probe', ++seq], queryFn: async () => 'ok' })
    })
  const browser = (state: 'online' | 'offline') =>
    act(() => {
      window.dispatchEvent(new Event(state))
    })
  return { ...rendered, fail, succeed, browser }
}

describe('useEngineReachable', () => {
  it('is reachable until the failure streak reaches the threshold', async () => {
    const { result, fail } = setup()
    expect(result.current).toBe(true)

    for (let i = 1; i < UNREACHABLE_THRESHOLD; i += 1) {
      await fail()
      expect(result.current).toBe(true)
    }
    await fail()
    expect(result.current).toBe(false)
  })

  it('resets the streak on any success — one blip between failures never trips it', async () => {
    const { result, fail, succeed } = setup()

    for (let round = 0; round < 3; round += 1) {
      for (let i = 1; i < UNREACHABLE_THRESHOLD; i += 1) await fail()
      await succeed()
      expect(result.current).toBe(true)
    }
  })

  it('recovers as soon as a query succeeds after tripping', async () => {
    const { result, fail, succeed } = setup()
    for (let i = 0; i < UNREACHABLE_THRESHOLD; i += 1) await fail()
    expect(result.current).toBe(false)

    await succeed()
    expect(result.current).toBe(true)
  })

  it('trips immediately when the browser goes offline and clears when it returns', async () => {
    const { result, browser } = setup()

    await browser('offline')
    expect(result.current).toBe(false)
    await browser('online')
    expect(result.current).toBe(true)
  })
})
