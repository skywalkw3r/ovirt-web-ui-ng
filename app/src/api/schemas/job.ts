import { z } from 'zod'

// The job owner is a User link. Bare it carries only id/href; with
// ?follow=owner the engine inlines the user record, so name/user_name/principal
// arrive and the Tasks page can show a human owner instead of a UUID. All
// optional — mock mode and restricted engines omit the whole object.
const JobOwnerSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().optional(),
  user_name: z.string().optional(),
  principal: z.string().optional(),
})

// An engine task (GET /jobs) — the async operations the engine tracks:
// migrations, snapshot creation/removal, VM lifecycle actions.
export const JobSchema = z.looseObject({
  id: z.string(),
  description: z.string().optional(),
  // 'started' | 'finished' | 'failed' | 'aborted' | 'unknown' — open string,
  // same rationale as vm status
  status: z.string(),
  auto_cleared: z.union([z.boolean(), z.stringbool()]).optional(),
  external: z.union([z.boolean(), z.stringbool()]).optional(),
  // The correlation id a caller stamped on the request that spawned this job
  // (see the Correlation-Id header in transport.ts). Absent on jobs started
  // without one; coerced to a string because the engine may serialize a
  // numeric-looking tag as a JSON number.
  correlation_id: z.coerce.string().optional(),
  // epoch ms; the live engine serializes numeric scalars as JSON strings
  start_time: z.coerce.number().optional(),
  end_time: z.coerce.number().optional(),
  last_updated: z.coerce.number().optional(),
  owner: JobOwnerSchema.optional(),
})

// JSON quirk: the "job" key is omitted when the list is empty.
export const JobListSchema = z.looseObject({
  job: z.array(JobSchema).optional(),
})

// A step within a job (GET /jobs/{id}/steps) — the ordered sub-operations the
// engine records under a task (validating, executing, finalizing, …). Same
// scalar-coercion posture as JobSchema: numbers arrive as JSON strings.
export const StepSchema = z.looseObject({
  id: z.string(),
  description: z.string().optional(),
  // StepStatus — same lowercase set as JobStatus (started/finished/failed/
  // aborted/unknown); kept open like the job status.
  status: z.string().optional(),
  // StepEnum — validating | executing | finalizing | unknown | … — open string
  type: z.string().optional(),
  // order within the current hierarchy level
  number: z.coerce.number().optional(),
  external: z.union([z.boolean(), z.stringbool()]).optional(),
  start_time: z.coerce.number().optional(),
  end_time: z.coerce.number().optional(),
})

// JSON quirk: the "step" key is omitted when the list is empty.
export const StepListSchema = z.looseObject({
  step: z.array(StepSchema).optional(),
})

export type Job = z.infer<typeof JobSchema>
export type Step = z.infer<typeof StepSchema>
