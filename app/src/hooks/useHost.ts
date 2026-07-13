import { useQuery } from '@tanstack/react-query'
import { getHost } from '../api/resources/hosts'
import { useSettings } from '../settings/SettingsProvider'

// A single host mirrors the list cadence (useHosts): infrastructure drifts
// slowly, so 30s is the floor and the Preferences interval can only slow it
// further, never speed it up to the VM cadence.
export const HOST_POLL_INTERVAL_MS = 30_000

export function useHost(id: string) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['host', id],
    queryFn: () => getHost(id),
    refetchInterval: Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS),
  })
}
