import type { UseQueryResult } from '@tanstack/react-query'
import type { GuidePlan } from './guidePlan'

// What the Guide Me dialog renders: the four-states view of its plan.
export type GuideState =
  | { status: 'pending' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'success'; plan: GuidePlan }

// Folds the inventories a guide reads into one dialog state: pending until
// every read is in, an error (with a retry of the failed reads) if any fails.
export function guideState(
  queries: UseQueryResult<unknown>[],
  fallbackError: string,
  computePlan: () => GuidePlan,
): GuideState {
  const failed = queries.filter((query) => query.isError)
  if (failed.length > 0) {
    const error = failed[0].error
    return {
      status: 'error',
      message: error instanceof Error ? error.message : fallbackError,
      retry: () => failed.forEach((query) => void query.refetch()),
    }
  }
  if (queries.some((query) => !query.isSuccess)) return { status: 'pending' }
  return { status: 'success', plan: computePlan() }
}
