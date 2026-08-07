import { getRequestBase } from '../servers/registry'
import { ApiError } from './transport'

// How long a follow= denial sticks before the follow variant is retried.
// Long enough that an overloaded engine isn't re-probed on every poll tick,
// short enough that a transient 5xx doesn't disable inlined extras for the
// whole session.
const DENIAL_TTL_MS = 10 * 60 * 1000

const denials = new Map<string, number>()

// Denials are per-ENGINE: a follow shape a WAN engine can't finish is no
// verdict on the next engine this tab signs in to (multi-engine switching is
// SPA-only — no reload separates sessions), so the map key carries the base
// the request actually went to. Callers keep passing shape-only keys.
function scopedKey(key: string): string {
  return `${getRequestBase()}|${key}`
}

export function isFollowDenied(key: string): boolean {
  const scoped = scopedKey(key)
  const until = denials.get(scoped)
  if (until === undefined) return false
  if (Date.now() >= until) {
    denials.delete(scoped)
    return false
  }
  return true
}

export function markFollowDenied(key: string): void {
  denials.set(scopedKey(key), Date.now() + DENIAL_TTL_MS)
}

// Test/sign-in hook: forget every remembered denial (module state is per-tab
// and otherwise survives until reload or TTL expiry).
export function resetFollowDenials(): void {
  denials.clear()
}

// transport.ts caps every request at REQUEST_TIMEOUT_MS via AbortSignal.timeout,
// which rejects the fetch with a 'TimeoutError' DOMException. A caller's own
// cancellation (query unmount) is an 'AbortError' and must propagate — match
// the name, not just the class, to tell them apart.
function isTransportTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError'
}

// The degrade condition, exported for the resource modules that keep their
// own multi-rung ladders (getVm's progressive walk, listHostsUsage's rich
// rung) instead of the two-leg helper below: a server fault (>= 500), a
// transport timeout, OR a plain 400 means "this engine can't follow this
// shape". The 400 leg is live-engine-verified, not defensive: some engine
// builds reject certain follow terms outright with 400 Bad Request
// (observed on production HEs: /jobs?follow=owner → 400,
// /storagedomains?follow=data_centers → 400/500) — for a FOLLOWED read that
// is the same "can't follow this" condition as a 5xx. 401/403/404, other
// 4xx, network errors and caller aborts propagate.
export function isDegradableFollowError(error: unknown): boolean {
  return (
    (error instanceof ApiError && (error.status >= 500 || error.status === 400)) ||
    isTransportTimeout(error)
  )
}

// The followed-read degrade contract (CLAUDE.md "Live-engine REST hygiene")
// as a shared helper: a degradable fault from the follow= variant (see
// isDegradableFollowError — 5xx, transport timeout, or the live-verified
// 400-on-follow engine quirk) answers with the bare read instead of failing,
// and the denial is remembered for DENIAL_TTL_MS so subsequent poll ticks
// skip the doomed follow entirely instead of paying a failed round-trip
// (times the query retry count) on every tick. An engine that can't finish
// the followed read inside REQUEST_TIMEOUT_MS (a WAN engine assembling
// follow=statistics for hundreds of VMs) is the same "engine can't follow
// this" condition, and the bare read is the variant proven cheap. 401/403,
// other 4xx, network errors and caller-initiated aborts propagate, and
// 404-as-empty handling stays with the caller. Keys are arbitrary but must be
// stable per follow-shape, e.g. 'vms.list:tags,statistics' (engine scoping is
// added internally — see scopedKey).
export async function fetchWithFollowFallback<T>(
  key: string,
  followRead: () => Promise<T>,
  bareRead: () => Promise<T>,
): Promise<T> {
  if (isFollowDenied(key)) return bareRead()
  try {
    return await followRead()
  } catch (error) {
    if (!isDegradableFollowError(error)) throw error
    const fault = error instanceof ApiError ? `HTTP ${error.status}` : null
    markFollowDenied(key)
    console.warn(
      `[followDegrade] ${key}: follow= read failed (${fault ?? 'timeout'}); serving bare reads for ${DENIAL_TTL_MS / 60_000}min`,
    )
    return bareRead()
  }
}
