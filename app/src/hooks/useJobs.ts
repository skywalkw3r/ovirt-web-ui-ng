import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endJob, listJobSteps, listJobs } from '../api/resources/jobs'
import type { Job } from '../api/schemas/job'
import { useNotify } from '../notifications/context'
import { useSettings } from '../settings/SettingsProvider'
import { useT } from '../i18n/useT'

// Same cadence as the VM lists (10s default, user-tunable in Preferences) —
// running tasks are exactly the thing users sit and watch. An unchanged
// refetch does not re-render consumers.
export function useJobs() {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['jobs'],
    queryFn: () => listJobs(),
    refetchInterval: refreshIntervalMs,
  })
}

// A single job's steps, fetched only while its Tasks row is expanded
// (`enabled`). Polls at the same live cadence as the job list so an in-flight
// job's steps advance in place; collapsed rows carry no poll. Keyed per job so
// each expanded row caches independently.
export function useJobSteps(jobId: string, enabled: boolean) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['jobs', jobId, 'steps'],
    queryFn: () => listJobSteps(jobId),
    enabled,
    refetchInterval: refreshIntervalMs,
  })
}

// The Tasks-page per-row "End job" mutation for externally-stuck jobs. Marks
// the job finished (succeeded) so it stops blocking dependent operations;
// invalidates ['jobs'] so the list and masthead badge refetch. Success toast
// via notify(); the engine fault surfaces verbatim through ApiError.message.
export function useEndJob() {
  const queryClient = useQueryClient()
  const { notify } = useNotify()
  const t = useT()

  return useMutation({
    mutationFn: (id: string) => endJob(id, { succeeded: true }),
    onSuccess: () => {
      notify({ title: t('tasks.end.success'), variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

// In-flight engine tasks — feeds the masthead tasks badge.
export function runningJobsCount(jobs: Job[] | undefined): number {
  return (jobs ?? []).filter((job) => job.status === 'started').length
}
