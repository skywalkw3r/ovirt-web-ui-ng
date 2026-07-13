import { ApiError, request } from '../transport'
import { JobListSchema, StepListSchema, type Job, type Step } from '../schemas/job'

// The engine task feed. Older engines may not expose /jobs to non-admin
// users and answer 404 for the whole collection — treat that as "no jobs"
// (same 404-tolerant posture as the optional subcollections). ?follow=owner
// inlines the owning User so the Tasks page shows a human name — but LIVE
// engines can answer HTTP 5xx to the followed read (system jobs carry no
// owner; the follow resolver NPEs — the same failure class as the
// permissions principal follows), so a 5xx degrades to a bare re-read and
// the owner column falls back to a dash. Mirrors listStorageDomains'
// follow-degrade posture.
export async function listJobs(opts: { max?: number } = {}): Promise<Job[]> {
  const max = String(opts.max ?? 50)
  let data
  try {
    data = JobListSchema.parse(await request(`/jobs?max=${max}&follow=owner`))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    if (error instanceof ApiError && error.status >= 500) {
      try {
        data = JobListSchema.parse(await request(`/jobs?max=${max}`))
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 404) return []
        throw retryError
      }
    } else {
      throw error
    }
  }
  // the engine does not guarantee ordering within the max window — callers
  // render a task feed, so sort newest-first here
  return (data.job ?? []).sort(
    (a, b) => (b.last_updated ?? b.start_time ?? 0) - (a.last_updated ?? a.start_time ?? 0),
  )
}

// A job's ordered steps (GET /jobs/{id}/steps). Fetched lazily when a Tasks
// row is expanded. 404-tolerant like listJobs: a job whose steps collection is
// unavailable (restricted engine, or a mock without the route) reads as "no
// steps" rather than surfacing an error inside the expanded row. Sorted by the
// engine-reported step number so the drill-down renders in execution order.
export async function listJobSteps(jobId: string): Promise<Step[]> {
  try {
    const data = StepListSchema.parse(await request(`/jobs/${encodeURIComponent(jobId)}/steps`))
    return (data.step ?? []).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// End an externally-stuck job (POST /jobs/{id}/end). The engine marks the job
// finished so it stops blocking dependent operations; the underlying work is
// not rolled back. `succeeded` records whether it ends as success or failure;
// `force` terminates it even when the engine would otherwise refuse. Verified
// against api-model JobService.End (params force/succeeded/async).
export async function endJob(
  jobId: string,
  opts: { succeeded?: boolean; force?: boolean } = {},
): Promise<void> {
  const body: Record<string, unknown> = { succeeded: opts.succeeded ?? true }
  if (opts.force !== undefined) body.force = opts.force
  await request(`/jobs/${encodeURIComponent(jobId)}/end`, { method: 'POST', body })
}
