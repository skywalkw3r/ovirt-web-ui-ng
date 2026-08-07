import { useQuery } from '@tanstack/react-query'
import { listStorageDomains } from '../api/resources/storageDomains'
import { useSettings } from '../settings/SettingsProvider'

// Capacity figures drift slowly; 30s keeps them fresh without adding to the
// engine load the 10s VM poll already generates. The constant is a floor —
// the Preferences interval can slow the poll further, never speed it up.
export const STORAGE_DOMAIN_POLL_INTERVAL_MS = 30_000

// The committed search rides in the query key so each engine-DSL query caches
// (and polls) separately; no-arg callers share the '' entry — mirror useEvents.
export function useStorageDomains(search = '') {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['storagedomains', search],
    queryFn: () => listStorageDomains({ search: search || undefined }),
    refetchInterval: Math.max(refreshIntervalMs, STORAGE_DOMAIN_POLL_INTERVAL_MS),
  })
}
