// Shared "is the human still here?" clock.
//
// Two consumers need the same answer and must not disagree: the idle watcher
// (which signs an abandoned session out) and the keep-alive (which must NOT
// prop one up). Previously the timestamp lived inside the idle watcher, so the
// keep-alive had no way to ask, and pinged every 60s forever — holding the
// engine's own idle expiry (UserSessionTimeOutInterval, default 30min) open
// for a session nobody was using.
//
// Tracking is refcounted and owns its own listeners so it cannot silently stop
// while a consumer still depends on it. Reads are a plain elapsed-ms number:
// clamping in background tabs and system sleep can only make it read LARGER
// (more idle), which fails safe in both directions — the watcher signs out
// late, the keep-alive stops pinging early.
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

let lastActivity = Date.now()
let refcount = 0
let detach: (() => void) | null = null

export function msSinceActivity(): number {
  return Date.now() - lastActivity
}

// Exported for tests and for consumers that observe activity by other means.
export function stampActivity(): void {
  lastActivity = Date.now()
}

// Starts (or joins) activity tracking on `target`. Returns a stop function;
// listeners come off only once every consumer has stopped.
export function startActivityTracking(target: EventTarget): () => void {
  if (refcount === 0) {
    // A fresh session starts "active" — otherwise the first keep-alive tick
    // after a login with no pointer movement would read as idle.
    stampActivity()
    for (const event of ACTIVITY_EVENTS) {
      target.addEventListener(event, stampActivity, { passive: true })
    }
    detach = () => {
      for (const event of ACTIVITY_EVENTS) {
        target.removeEventListener(event, stampActivity)
      }
    }
  }
  refcount += 1

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    refcount -= 1
    if (refcount === 0) {
      detach?.()
      detach = null
    }
  }
}
