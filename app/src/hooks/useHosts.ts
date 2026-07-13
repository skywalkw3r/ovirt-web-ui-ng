import { useQuery } from '@tanstack/react-query'
import { listHosts, listHostsUsage } from '../api/resources/hosts'
import { useCapabilities } from '../auth/capabilities'
import { useSettings } from '../settings/SettingsProvider'

// Host inventory drifts slowly; 30s matches the other infrastructure polls
// (storage domains) rather than the 10s VM cadence. The constant is a floor —
// the Preferences interval can slow the poll further, never speed it up.
export const HOST_POLL_INTERVAL_MS = 30_000

// The committed search rides in the query key so each engine-DSL query caches
// (and polls) separately; no-arg callers share the '' entry — mirror useEvents.
// all_content rides on the read so computed properties (hosted_engine → the
// HE crown) are present for every consumer of the shared ['hosts', ''] entry —
// the infra tree, the join columns, and the picker modals all reuse one cache
// entry and one poll instead of splitting into crown/no-crown variants. It is
// deliberately NOT part of the query key: the response is a strict superset
// of the bare read.
export function useHosts(search = '') {
  // GET /hosts needs an admin session on the engine — skip the doomed request
  // for user-tier accounts (HostsPage renders <NotPermitted> instead). Gating
  // on isAdmin alone is safe: it stays false until the profile has loaded.
  const { isAdmin } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['hosts', search],
    queryFn: () => listHosts({ search: search || undefined, allContent: true }),
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
    enabled: isAdmin,
  })
}

// The hosts LIST page's query: same admin gate and poll floor as useHosts,
// with usage gauges inlined for the Memory/CPU/Network percent columns.
// The statistics + per-NIC-statistics follows are the most expensive host
// read the engine offers, so callers that only need the gauges situationally
// (the infra view's cluster pane) pass enabled to defer the fetch until the
// gauges are actually on screen — the tree itself runs on the cheap useHosts.
export function useHostsUsage(search = '', opts: { enabled?: boolean } = {}) {
  const { isAdmin } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['hosts', search, 'usage'],
    queryFn: () => listHostsUsage(search || undefined),
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
    enabled: isAdmin && (opts.enabled ?? true),
  })
}
