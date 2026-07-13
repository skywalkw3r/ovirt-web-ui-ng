// Framework-agnostic idle watcher: stamps a timestamp on any activity event
// and sweeps every 30s for a deadline crossing. Kept out of the React hook
// (useIdleLogout) so the timing logic is unit-testable in the repo's plain
// node vitest environment against a bare EventTarget — same split as
// console/console-controller.ts.
//
// A 30s sweep beats one long setTimeout: background tabs clamp timers, and a
// minutes-scale deadline only needs minutes-scale precision — the sweep
// measures elapsed time, so clamping and system sleep can only make it fire
// LATE, never spuriously.
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
const CHECK_INTERVAL_MS = 30_000

export interface IdleWatcher {
  stop: () => void
}

export function startIdleWatcher(
  timeoutMinutes: number,
  onTimeout: () => void,
  target: EventTarget,
): IdleWatcher {
  let lastActivity = Date.now()
  const stamp = () => {
    lastActivity = Date.now()
  }
  for (const event of ACTIVITY_EVENTS) {
    target.addEventListener(event, stamp, { passive: true })
  }

  const interval = setInterval(() => {
    if (Date.now() - lastActivity >= timeoutMinutes * 60_000) {
      onTimeout()
    }
  }, CHECK_INTERVAL_MS)

  return {
    stop() {
      for (const event of ACTIVITY_EVENTS) {
        target.removeEventListener(event, stamp)
      }
      clearInterval(interval)
    },
  }
}
