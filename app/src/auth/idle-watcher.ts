import { msSinceActivity, startActivityTracking } from './activity'

// Framework-agnostic idle watcher: sweeps every 30s for a deadline crossing
// against the shared activity clock (auth/activity.ts). Kept out of the React
// hook (useIdleLogout) so the timing logic is unit-testable in the repo's
// plain node vitest environment against a bare EventTarget — same split as
// console/console-controller.ts.
//
// A 30s sweep beats one long setTimeout: background tabs clamp timers, and a
// minutes-scale deadline only needs minutes-scale precision — the sweep
// measures elapsed time, so clamping and system sleep can only make it fire
// LATE, never spuriously.
const CHECK_INTERVAL_MS = 30_000

export interface IdleWatcher {
  stop: () => void
}

export function startIdleWatcher(
  timeoutMinutes: number,
  onTimeout: () => void,
  target: EventTarget,
): IdleWatcher {
  // The activity clock is shared with the keep-alive (auth/activity.ts) so the
  // two cannot disagree about whether the user is still here — one signing out
  // an idle session while the other holds it open was the old bug.
  const stopTracking = startActivityTracking(target)

  const interval = setInterval(() => {
    if (msSinceActivity() >= timeoutMinutes * 60_000) {
      onTimeout()
    }
  }, CHECK_INTERVAL_MS)

  return {
    stop() {
      stopTracking()
      clearInterval(interval)
    },
  }
}
