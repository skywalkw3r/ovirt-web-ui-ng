import { useQuery } from '@tanstack/react-query'
import { getHost } from '../api/resources/hosts'
import { useSettings } from '../settings/SettingsProvider'
// A single host mirrors the list cadence, so it shares useHosts' one canonical
// floor constant (was duplicated here — the two silently drifting is the risk).
// 30s is the floor; the Preferences interval can only slow it further, never
// speed it up to the VM cadence.
import { HOST_POLL_INTERVAL_MS } from './useHosts'

export function useHost(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id],
    queryFn: () => getHost(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
  })
}
