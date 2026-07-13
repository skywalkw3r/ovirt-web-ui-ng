import { useQuery } from '@tanstack/react-query'
import { listVms } from '../api/resources/vms'
import { useSettings } from '../settings/SettingsProvider'

// Poll cadence mirrors legacy background-refresh (10s); TanStack pauses
// refetching automatically while the tab is hidden. This constant is the
// default — the live cadence comes from useSettings (Preferences).
export const VM_POLL_INTERVAL_MS = 10_000

// Payload-aware poll floor: /vms is an unbounded full-collection read (plus
// the server-side follow=tags join), so on a large install every tick
// re-downloads MB-scale JSON and re-parses it on the main thread. Small
// installs keep the snappy user-set cadence exactly; past the thresholds the
// interval floors at the infra (30s) / admin (60s) cadences so the poll cost
// scales with the payload instead of hammering the engine every 10s.
// Exported for the unit test; undefined count (nothing fetched yet) keeps
// the user cadence so the first load isn't slowed.
export function vmPollIntervalMs(settingMs: number, vmCount: number | undefined): number {
  const floor = vmCount === undefined ? 0 : vmCount > 2000 ? 60_000 : vmCount > 500 ? 30_000 : 0
  return Math.max(settingMs, floor)
}

// Search is part of the key so each query gets its own cache entry; the
// mutation hooks invalidate the bare ['vms'] prefix, which covers them all.
// follow=tags rides on every list read so folder membership, per-folder
// counts and label chips derive from the rows themselves instead of N+1
// per-VM tag queries (see followedTagsOf in useTags). follow=statistics
// feeds the Uptime column with elapsed.time — vm.start_time is
// creation/import, not the current run (see vmUptimeSeconds); legacy VM
// Portal fetched the same statistics per-VM in its background refresh, so
// one inlined list read is the cheaper shape. A 5xx on the followed read
// degrades to a bare list inside listVms — tags and uptime go absent
// rather than the list failing.
export function useVms(search?: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['vms', search ?? ''],
    queryFn: () => listVms({ search, follow: 'tags,statistics' }),
    refetchInterval: (query) => vmPollIntervalMs(refreshIntervalMs, query.state.data?.length),
  })
}
