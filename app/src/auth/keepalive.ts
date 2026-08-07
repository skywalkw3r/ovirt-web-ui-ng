import { ApiError, request } from '../api/transport'
import { msSinceActivity } from './activity'

// How often to ping the engine to keep the SSO session warm. The engine
// expires idle SSO sessions (UserSessionTimeOutInterval, default 30min); a
// lightweight periodic GET resets that idle clock the same way legacy's
// background-refresh sagas did with their scheduler. 60s is well under any
// realistic timeout and cheap (GET /ovirt-engine/api is tiny).
export const DEFAULT_KEEPALIVE_MS = 60_000

// ...but only while the user is actually HERE. An unconditional ping keeps the
// engine's idle expiry open forever for any tab left open, which quietly
// overrides the administrator's server-side session policy — the one control
// that still bites when a token has leaked. Pinging only on recent activity
// means an abandoned tab lets the engine's own timer run out and end the
// session, while someone actually working is never signed out mid-task.
//
// The window is generous relative to the tick (2 intervals = 2min) so reading
// a page, or a tab briefly backgrounded with a clamped timer, still counts as
// present; it is far below any realistic engine timeout, so a returning user's
// next ping lands well before expiry.
export const ACTIVITY_WINDOW_MS = DEFAULT_KEEPALIVE_MS * 2

export interface KeepaliveController {
  stop: () => void
}

// Starts a periodic keep-alive ping against the engine's API root
// (GET /ovirt-engine/api via the shared transport, so it carries the bearer
// token + Filter header). If a ping comes back 401 the SSO session has
// expired server-side: onExpired() fires so the caller can drop to a
// logged-out 'session expired' state. Other errors (transient network, 5xx)
// are swallowed — a single blip should not log the user out; the next tick
// retries. Returns a controller whose stop() clears the timer and prevents
// any in-flight ping from calling back.
export function startKeepalive(
  onExpired: () => void,
  intervalMs: number = DEFAULT_KEEPALIVE_MS,
  idleSince: () => number = msSinceActivity,
): KeepaliveController {
  let stopped = false

  async function ping(): Promise<void> {
    try {
      await request('')
    } catch (error) {
      if (stopped) return
      if (error instanceof ApiError && error.status === 401) {
        stop()
        onExpired()
      }
      // Non-401 errors are transient; leave the timer running to retry.
    }
  }

  const timer = setInterval(() => {
    // Idle: skip the ping and let the engine's own expiry govern. The timer
    // keeps running — the moment the user comes back, the next tick resumes
    // keeping the session warm (and if the engine expired it meanwhile, that
    // ping is what discovers the 401).
    if (idleSince() > ACTIVITY_WINDOW_MS) return
    void ping()
  }, intervalMs)

  function stop(): void {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  return { stop }
}
