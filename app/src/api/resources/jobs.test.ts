import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { endJob, listJobSteps, listJobs } from './jobs'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (mirrors the mockFetch helper in the other
// resource tests) so these cover the wire shape without reaching the mock
// engine.
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

describe('listJobs', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('follows the owner link and sorts newest-first, coercing string scalars', async () => {
    const fetchMock = mockFetch(200, {
      job: [
        { id: 'j1', status: 'finished', last_updated: '1000' },
        { id: 'j2', status: 'started', last_updated: 3000 },
        // no last_updated — falls back to start_time for ordering
        { id: 'j3', status: 'started', start_time: '2000' },
      ],
    })

    const jobs = await listJobs()

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/jobs?')
    expect(url).toContain('follow=owner')
    expect(url).toContain('max=50')
    expect(jobs.map((j) => j.id)).toEqual(['j2', 'j3', 'j1'])
  })

  it('parses an inlined owner user for the owner column', async () => {
    mockFetch(200, {
      job: [
        {
          id: 'j1',
          status: 'started',
          owner: { id: 'u1', user_name: 'admin@internal-authz', principal: 'admin' },
        },
      ],
    })

    const [job] = await listJobs()
    expect(job.owner?.user_name).toBe('admin@internal-authz')
  })

  it('returns [] when the engine omits the job key (empty feed)', async () => {
    mockFetch(200, {})
    await expect(listJobs()).resolves.toEqual([])
  })

  // Older engines hide /jobs from non-admins with a 404 — treat as "no jobs".
  it('maps HTTP 404 to the empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listJobs()).resolves.toEqual([])
  })

  it('still surfaces HTTP 500 as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'boom' } })
    await expect(listJobs()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('listJobSteps', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('requests the job steps subcollection and sorts by step number', async () => {
    const fetchMock = mockFetch(200, {
      step: [
        { id: 's2', description: 'Executing', status: 'started', type: 'executing', number: '2' },
        { id: 's1', description: 'Validating', status: 'finished', type: 'validating', number: 1 },
      ],
    })

    const steps = await listJobSteps('job-01')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('/ovirt-engine/api/jobs/job-01/steps')
    expect(steps.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('returns [] when the engine omits the step key', async () => {
    mockFetch(200, {})
    await expect(listJobSteps('job-01')).resolves.toEqual([])
  })

  it('maps HTTP 404 (steps unavailable) to the empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listJobSteps('job-01')).resolves.toEqual([])
  })
})

describe('endJob', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs { succeeded: true } to /jobs/{id}/end by default', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(endJob('job-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/jobs/job-01/end')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ succeeded: true })
  })

  it('includes force when the caller passes it', async () => {
    const fetchMock = mockFetch(200, {})
    await endJob('job-01', { succeeded: false, force: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ succeeded: false, force: true })
  })

  it('surfaces the engine fault verbatim as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Cannot end job. Job is not external.' },
    })

    const error = await endJob('job-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Cannot end job. Job is not external.' })
  })
})
