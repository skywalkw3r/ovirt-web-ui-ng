import { ApiError, request } from '../api/transport'

// How often to ping the engine to keep the SSO session warm. The engine
// expires idle SSO sessions (UserSessionTimeOutInterval, default 30min); a
// lightweight periodic GET resets that idle clock the same way legacy's
// background-refresh sagas did with their scheduler. 60s is well under any
// realistic timeout and cheap (GET /ovirt-engine/api is tiny).
export const DEFAULT_KEEPALIVE_MS = 60_000

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
    void ping()
  }, intervalMs)

  function stop(): void {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  return { stop }
}
