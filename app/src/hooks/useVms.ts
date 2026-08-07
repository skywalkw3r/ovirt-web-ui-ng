import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listVms } from '../api/resources/vms'
import type { Vm } from '../api/schemas/vm'
import { isActiveEngineWan } from '../servers/registry'
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
// `wan` (deployer-marked high-latency engine — isActiveEngineWan) floors the
// cadence at the 30s infra rate regardless of count: on such a link even a
// small collection's round-trip is seconds-scale, and a 10s cadence just
// queues overlapping waits. The size floors still apply on top.
export function vmPollIntervalMs(
  settingMs: number,
  vmCount: number | undefined,
  wan = false,
): number {
  const sizeFloor = vmCount === undefined ? 0 : vmCount > 2000 ? 60_000 : vmCount > 500 ? 30_000 : 0
  return Math.max(settingMs, sizeFloor, wan ? 30_000 : 0)
}

// Payload-aware follow shape, same philosophy as the poll floor above:
// follow=statistics multiplies both the engine's assembly work (a per-VM
// stat collection, server-side) and the payload several-fold, and it feeds
// exactly one list consumer — the Uptime column (elapsed.time; vm.start_time
// is creation/import, not the current run — see vmUptimeSeconds). On a large
// install, or over a WAN hop to a remote engine, that one follow term turns
// the seconds-scale bare list into a read that outruns the 30s transport
// timeout (observed: 500+ VMs on an engine reached over a WAN hop —
// the bare list answered in ~2s while follow=tags,statistics never
// finished). So statistics rides only while the collection is provably
// small; sharing the 500 threshold with the poll floor keeps "big install"
// meaning one thing. An unknown count (nothing fetched yet — possibly a huge
// install behind a slow link) starts light rather than gambling the first
// paint on the heaviest shape; a small install upgrades on the next tick,
// and Uptime renders its em dash for that one interval (the same rendering a
// degraded read produces, so no new UI state). tags always rides: folder
// membership, per-folder counts and label chips derive from it, and it is a
// cheap server-side join. Exported for the unit test.
export const VM_STATISTICS_FOLLOW_MAX = 500

// `wan` (deployer-marked engine — isActiveEngineWan) pins the light shape
// unconditionally: the observed WAN failure was exactly follow=statistics
// outrunning the transport timeout, so a marked engine never probes it at
// any collection size — Uptime shows its em dash there, tags still ride.
export function vmListFollow(vmCount: number | undefined, wan = false): string {
  if (wan) return 'tags'
  return vmCount !== undefined && vmCount <= VM_STATISTICS_FOLLOW_MAX ? 'tags,statistics' : 'tags'
}

// Search is part of the key so each query gets its own cache entry; the
// mutation hooks invalidate the bare ['vms'] prefix, which covers them all.
// follow=tags rides on every list read so folder membership, per-folder
// counts and label chips derive from the rows themselves instead of N+1
// per-VM tag queries (see followedTagsOf in useTags); follow=statistics is
// payload-aware (vmListFollow above). A 5xx or transport timeout on the
// followed read degrades to a bare list inside listVms — tags and uptime go
// absent rather than the list failing.
export function useVms(search?: string) {
  const { refreshIntervalMs } = useSettings()
  const queryClient = useQueryClient()
  // '' and undefined share the ['vms', ''] cache entry (empty search box,
  // membership tabs, no-arg callers) — normalize so every observer of that
  // key issues the identical URL (same-key-same-fn invariant; an empty
  // search= param would otherwise ride on some observers' reads). The follow
  // shape reads the CACHED count at fetch time, so it too is identical for
  // every observer of the key.
  const queryKey = ['vms', search ?? '']
  return useQuery({
    queryKey,
    // isActiveEngineWan is read at fetch/interval time (not render) so every
    // observer of the key stays identical, mirroring the cached-count read.
    queryFn: () =>
      listVms({
        search: search || undefined,
        follow: vmListFollow(queryClient.getQueryData<Vm[]>(queryKey)?.length, isActiveEngineWan()),
      }),
    refetchInterval: (query) =>
      vmPollIntervalMs(refreshIntervalMs, query.state.data?.length, isActiveEngineWan()),
  })
}
