import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listEvents } from './resources/events'
import { scopedEventsSearch } from '../lib/scopedEvents'
// Static import: transport reaches the mock via a dynamic import() that cannot
// resolve while the clock is faked (same posture as events-paging.test.ts).
import { resetMockVms } from './mock/handlers'
import { clearSessionToken, setSessionToken } from './session'

// The search terms are the ones webadmin's <Entity>EventListModel sets; pin
// them so a refactor cannot drift off the engine grammar.
describe('scopedEventsSearch', () => {
  it('builds the webadmin search term for each entity', () => {
    expect(scopedEventsSearch.template('centos-stream-9')).toBe('event_template=centos-stream-9')
    expect(scopedEventsSearch.cluster('Default')).toBe('cluster=Default')
    expect(scopedEventsSearch.dataCenter('Default')).toBe('event_datacenter=Default')
    expect(scopedEventsSearch.storageDomain('data')).toBe('event_storage=data')
    expect(scopedEventsSearch.quota('dev-quota')).toBe('quota=dev-quota')
  })
})

describe('scoped event search (mock engine)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
    resetMockVms()
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  async function call<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  const ids = async (search: string) =>
    (await call(listEvents({ search }))).map((event) => event.id).sort()

  it('narrows the feed to the events linked to the named entity', async () => {
    expect(await ids(scopedEventsSearch.template('centos-stream-9'))).toEqual(['ev-16', 'ev-17'])
    expect(await ids(scopedEventsSearch.storageDomain('hosted_storage'))).toEqual(['ev-17'])
    expect(await ids(scopedEventsSearch.quota('dev-quota'))).toEqual(['ev-18'])
    // containment rather than exact lists: other fixtures may link these too
    expect(await ids(scopedEventsSearch.cluster('Default'))).toEqual(
      expect.arrayContaining(['ev-13', 'ev-16']),
    )
    expect(await ids(scopedEventsSearch.dataCenter('Default'))).toEqual(
      expect.arrayContaining(['ev-04', 'ev-14', 'ev-16', 'ev-17', 'ev-18']),
    )
  })

  it('matches names case-insensitively and returns nothing for an unlinked entity', async () => {
    expect(await ids(scopedEventsSearch.template('CENTOS-STREAM-9'))).toEqual(['ev-16', 'ev-17'])
    expect(await ids(scopedEventsSearch.template('Blank'))).toEqual([])
    expect(await ids(scopedEventsSearch.cluster('lab-nested'))).toEqual([])
  })
})
