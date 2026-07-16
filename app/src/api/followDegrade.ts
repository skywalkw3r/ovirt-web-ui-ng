import { ApiError } from './transport'

// How long a follow= denial sticks before the follow variant is retried.
// Long enough that an overloaded engine isn't re-probed on every poll tick,
// short enough that a transient 5xx doesn't disable inlined extras for the
// whole session.
const DENIAL_TTL_MS = 10 * 60 * 1000

const denials = new Map<string, number>()

export function isFollowDenied(key: string): boolean {
  const until = denials.get(key)
  if (until === undefined) return false
  if (Date.now() >= until) {
    denials.delete(key)
    return false
  }
  return true
}

export function markFollowDenied(key: string): void {
  denials.set(key, Date.now() + DENIAL_TTL_MS)
}

// Test/sign-in hook: forget every remembered denial (module state is per-tab
// and otherwise survives until reload or TTL expiry).
export function resetFollowDenials(): void {
  denials.clear()
}

// The followed-read degrade contract (CLAUDE.md "Live-engine REST hygiene")
// as a shared helper: a 5xx from the follow= variant answers with the bare
// read instead of failing, and the denial is remembered for DENIAL_TTL_MS so
// subsequent poll ticks skip the doomed follow entirely instead of paying a
// failed round-trip (times the query retry count) on every tick. Only server
// faults (>= 500) degrade — 4xx (auth, bad request) and network errors
// propagate, and 404-as-empty handling stays with the caller. Keys are
// arbitrary but must be stable per follow-shape, e.g. 'vms.list:tags,statistics'.
export async function fetchWithFollowFallback<T>(
  key: string,
  followRead: () => Promise<T>,
  bareRead: () => Promise<T>,
): Promise<T> {
  if (isFollowDenied(key)) return bareRead()
  try {
    return await followRead()
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      markFollowDenied(key)
      console.warn(
        `[followDegrade] ${key}: follow= read failed (HTTP ${error.status}); serving bare reads for ${DENIAL_TTL_MS / 60_000}min`,
      )
      return bareRead()
    }
    throw error
  }
}
