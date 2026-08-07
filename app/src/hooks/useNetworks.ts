import { useQuery } from '@tanstack/react-query'
import { listNetworks } from '../api/resources/networks'
import { useSettings } from '../settings/SettingsProvider'

// Networks change rarely compared to VM state, so a slower cadence is enough.
// The constant is a floor — the Preferences interval can slow the poll
// further, never speed it up.
export const NETWORK_POLL_INTERVAL_MS = 30_000

// The committed search rides in the query key so each engine-DSL query caches
// (and polls) separately; no-arg callers share the '' entry — mirror useEvents.
export function useNetworks(search = '') {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['networks', search],
    queryFn: () => listNetworks({ search: search || undefined }),
    refetchInterval: Math.max(refreshIntervalMs, NETWORK_POLL_INTERVAL_MS),
  })
}
