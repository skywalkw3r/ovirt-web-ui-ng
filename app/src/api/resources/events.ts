import { request } from '../transport'
import { OvirtEventListSchema, type OvirtEvent } from '../schemas/event'

export async function listEvents(
  opts: { max?: number; page?: number; search?: string } = {},
): Promise<OvirtEvent[]> {
  const params = new URLSearchParams({ max: String(opts.max ?? 100) })
  // Compose the caller's search DSL (host.name=…, severity=…, free text) with
  // the server-side paging tail. The engine pages the audit log through the
  // search query: `sortby time desc page N` returns the Nth window of `max`
  // rows, newest first — the same mechanism webadmin's event grid uses. The
  // Events page passes `page` to walk the full log window-by-window; the
  // cheap newest-window callers (notification drawer, dashboard activity,
  // host/VM detail tabs) omit it and keep the plain max-bounded read.
  const clauses: string[] = []
  if (opts.search) clauses.push(opts.search)
  if (opts.page !== undefined) clauses.push(`sortby time desc page ${opts.page}`)
  if (clauses.length > 0) params.set('search', clauses.join(' '))
  const data = OvirtEventListSchema.parse(await request(`/events?${params.toString()}`))
  // the engine does not guarantee ordering within the window — callers
  // render an activity feed, so sort newest first here
  return (data.event ?? []).sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
}

// Dismiss an event by removing it from the engine's internal audit log
// (EventService.remove → DELETE /events/{id}, verified against
// ovirt-engine-api-model). The notification drawer's Alerts group wires this
// to a per-alert and a dismiss-all control; alert-severity events are the
// durable, operator-attention ones worth clearing by hand.
export async function removeEvent(id: string): Promise<void> {
  await request(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
