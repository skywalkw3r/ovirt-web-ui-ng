// Masthead controls (the tasks badge, the notification bell) keep their
// collection polling while CLOSED only to refresh a badge count, so they ride
// a slower floor than the user's refresh setting and switch to the live
// cadence when opened. A faster observer of the same query — the Tasks page,
// the dashboard's activity feed — still drives it at the setting: TanStack
// fetches whenever any observer's timer fires and dedupes the request, so the
// floor only applies while nothing on screen needs the collection fresh.
export const BACKGROUND_POLL_FLOOR_MS = 30_000

export interface PollOptions {
  // true while the consumer is a closed masthead control
  background?: boolean
}

export function pollIntervalMs(refreshIntervalMs: number, background: boolean): number {
  return background ? Math.max(refreshIntervalMs, BACKGROUND_POLL_FLOOR_MS) : refreshIntervalMs
}
