// @vitest-environment jsdom
import '../test/env'
import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FIND_TIMEOUT_MS, renderHookWithProviders } from '../test/render'
import { runningJobsCount, useEndJob, useJobs } from './useJobs'

// Query + mutation hooks against the mock engine's job fixtures (6 jobs, two
// of them in flight), through the real signed-in provider stack.
describe('useJobs', () => {
  it('loads the job list for the signed-in session and counts the in-flight ones', async () => {
    const { result } = renderHookWithProviders(() => useJobs())

    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: FIND_TIMEOUT_MS,
    })
    const jobs = result.current.data ?? []
    expect(jobs.map((job) => job.id)).toEqual(
      expect.arrayContaining(['job-01', 'job-02', 'job-03', 'job-04']),
    )
    expect(jobs.filter((job) => job.status === 'started').map((job) => job.id)).toEqual([
      'job-01',
      'job-02',
    ])
    expect(runningJobsCount(jobs)).toBe(2)
    expect(runningJobsCount(undefined)).toBe(0)
  })

  it('ends a stuck job: the list refetches with it finished and a success toast fires', async () => {
    const { result } = renderHookWithProviders(() => ({ jobs: useJobs(), end: useEndJob() }))
    await waitFor(() => expect(result.current.jobs.isSuccess).toBe(true), {
      timeout: FIND_TIMEOUT_MS,
    })
    const jobOne = () => result.current.jobs.data?.find((job) => job.id === 'job-01')
    expect(jobOne()?.status).toBe('started')

    act(() => result.current.end.mutate('job-01'))

    await screen.findByText('Job ended', undefined, { timeout: FIND_TIMEOUT_MS })
    await waitFor(() => expect(jobOne()?.status).toBe('finished'), { timeout: FIND_TIMEOUT_MS })
    expect(runningJobsCount(result.current.jobs.data)).toBe(1)
  })

  it('surfaces the engine fault as a danger toast when a job cannot be ended', async () => {
    const { result } = renderHookWithProviders(() => useEndJob())
    await waitFor(() => expect(result.current).toBeDefined())

    // job-03 already finished — the mock answers 409 like the engine does
    act(() => result.current.mutate('job-03'))

    await screen.findByText('Job job-03 is already finished', undefined, {
      timeout: FIND_TIMEOUT_MS,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
