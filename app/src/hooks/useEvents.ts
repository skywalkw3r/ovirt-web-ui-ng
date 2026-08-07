import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listEvents } from '../api/resources/events'
import { useSettings } from '../settings/SettingsProvider'

// Same cadence as the VM lists (10s default, user-tunable in Preferences).
// Relative timestamps are kept fresh by useNow in EventsPage — an unchanged
// refetch does not re-render consumers. The committed search rides in the
// query key so each engine-DSL query caches (and polls) separately; callers
// without a search (dashboard, notification drawer) share the '' entry.
//
// This is the cheap newest-100 window — no server-side paging. The dashboard
// Activity feed and the notification drawer depend on exactly this shape; the
// Events *page* walks the full audit log through useEventsPage below.
export function useEvents(search = '') {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['events', search],
    queryFn: () => listEvents({ max: 100, search: search || undefined }),
    refetchInterval: refreshIntervalMs,
  })
}

// Server-side paged read for the Events page: window N of `perPage` rows,
// newest first, so audit history beyond the newest 100 stays reachable
// (webadmin parity). Keyed under ['events', 'page', …] — separate from
// useEvents' newest-100 entries — so paging can never disturb the drawer or
// dashboard cache or their polling. keepPreviousData holds the current window
// on screen while the next one loads, so page flips never flash the skeleton;
// only the current window polls (stale window entries fall out of the cache).
export function useEventsPage(search: string, page: number, perPage: number) {
  const { refreshIntervalMs } = useSettings()
  return useQuery({
    queryKey: ['events', 'page', search, page, perPage],
    queryFn: () => listEvents({ search: search || undefined, page, max: perPage }),
    refetchInterval: refreshIntervalMs,
    placeholderData: keepPreviousData,
  })
}
