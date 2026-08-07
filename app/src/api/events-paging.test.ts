import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listEvents } from './resources/events'
import { hasNextPage, indeterminateItemCount } from '../lib/indeterminatePagination'
// Static import matters: transport reaches the mock via a dynamic import()
// that cannot resolve while the clock is faked — pre-warming the module here
// keeps the first mock call from hanging (same posture as the other
// mock-engine suites).
import { resetMockVms } from './mock/handlers'
import { clearSessionToken, setSessionToken } from './session'

function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

// The engine pages the audit log through the search DSL: `sortby time desc
// page N` composed after any caller search terms. These tests pin the exact
// request paths so the paging tail can never silently detach from the
// documented engine grammar (URLSearchParams encodes ' '→'+' and '='→'%3D').
describe('listEvents server-side paging params', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('appends the sortby/page tail as the search when paging without a search', async () => {
    const fetchMock = mockFetch(200, {})
    await listEvents({ page: 2, max: 50 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/events?max=50&search=sortby+time+desc+page+2',
    )
  })

  it('composes the caller search DSL with the paging tail', async () => {
    const fetchMock = mockFetch(200, {})
    await listEvents({ search: 'severity=error', page: 3, max: 25 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/events?max=25&search=severity%3Derror+sortby+time+desc+page+3',
    )
  })

  it('keeps multi-term searches intact ahead of the tail', async () => {
    const fetchMock = mockFetch(200, {})
    await listEvents({ search: 'web and severity=error', page: 1, max: 20 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/events?max=20&search=web+and+severity%3Derror+sortby+time+desc+page+1',
    )
  })

  it('emits no search param at all when neither search nor page is given', async () => {
    // the cheap newest-window callers (drawer, dashboard) must keep the
    // plain max-bounded read — no stray sortby tail on every poll
    const fetchMock = mockFetch(200, {})
    await listEvents({ max: 100 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/events?max=100')
  })
})

// Page-navigation against the mock engine: the mock ships >100 events
// (15 handcrafted + generated backlog) precisely so these windows exist.
describe('events page navigation (through the mock engine)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // routes listEvents through the transport's mock branch instead of fetch
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
    resetMockVms()
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  // Settle the mock latency timer without reaching the multi-second
  // state-transition timers.
  async function call<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('walks the full audit log window-by-window until a short page stops it', async () => {
    // the unpaged read bounded above the fixture count is the ground truth
    const all = await call(listEvents({ max: 500 }))
    // the audit log must outgrow the old newest-100 ceiling, or this
    // feature has nothing to prove in dev:mock
    expect(all.length).toBeGreaterThan(100)

    const perPage = 50
    const seen = new Set<string>()
    const pageSizes: number[] = []
    let page = 1
    for (;;) {
      const rows = await call(listEvents({ page, max: perPage }))
      pageSizes.push(rows.length)
      for (const row of rows) {
        // windows must tile: no row repeats across page boundaries
        expect(seen.has(row.id)).toBe(false)
        seen.add(row.id)
      }
      if (!hasNextPage(perPage, rows.length)) break
      page += 1
      expect(page).toBeLessThan(20) // fixture drift guard, not a real bound
    }

    // every full window then one short window, covering the whole log
    const fullPages = Math.floor(all.length / perPage)
    expect(pageSizes).toEqual([...Array<number>(fullPages).fill(perPage), all.length % perPage])
    expect(seen.size).toBe(all.length)
  })

  it('serves windows newest-first and contiguous across the page boundary', async () => {
    const page1 = await call(listEvents({ page: 1, max: 50 }))
    const page2 = await call(listEvents({ page: 2, max: 50 }))
    expect(page1).toHaveLength(50)
    expect(page2).toHaveLength(50)
    // newest handcrafted fixture (2 minutes ago) heads the log
    expect(page1[0]?.id).toBe('ev-15')
    // strictly descending inside a window and across the boundary
    const times = [...page1, ...page2].map((event) => event.time ?? 0)
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThanOrEqual(times[i - 1] ?? Infinity)
    }
  })

  it('pages a severity-filtered search without losing matches beyond the window', async () => {
    const all = await call(listEvents({ search: 'severity=normal', max: 500 }))
    // the filtered set itself must span multiple windows for this to prove
    // anything — the backlog's severity mix guarantees it
    expect(all.length).toBeGreaterThan(50)

    const page1 = await call(listEvents({ search: 'severity=normal', page: 1, max: 50 }))
    const page2 = await call(listEvents({ search: 'severity=normal', page: 2, max: 50 }))
    expect(page1).toHaveLength(50)
    expect(page1.every((event) => event.severity === 'normal')).toBe(true)
    expect(page2.every((event) => event.severity === 'normal')).toBe(true)
    const union = new Set([...page1, ...page2].map((event) => event.id))
    expect(union.size).toBe(Math.min(all.length, 100))

    // the indeterminate itemCount PF sees along this walk: +1 while full,
    // exact once the short window lands
    expect(indeterminateItemCount(1, 50, page1.length)).toBe(51)
    if (page2.length < 50) {
      expect(indeterminateItemCount(2, 50, page2.length)).toBe(all.length)
    }
  })

  it('returns an empty window beyond the end of the log (page steps back cleanly)', async () => {
    const beyond = await call(listEvents({ page: 99, max: 100 }))
    expect(beyond).toEqual([])
    expect(hasNextPage(100, beyond.length)).toBe(false)
  })
})
