import { useEffect, useRef } from 'react'
import { startIdleWatcher } from './idle-watcher'

// Signs the user out after N minutes without interaction (the Preferences
// "Session timeout" setting). Activity = pointer/key/wheel/touch anywhere in
// this document; the listeners are passive and only stamp a timestamp, so
// tracking costs nothing per event. Timing logic lives in idle-watcher.ts.
//
// Each browser tab tracks its own activity: a console tab watched read-only
// keeps ITSELF alive, while an abandoned app tab still times out. The logout
// revokes the token server-side, which is the actual security boundary.
export function useIdleLogout(
  enabled: boolean,
  timeoutMinutes: number,
  onTimeout: () => void,
): void {
  // The callback rides a ref so a re-render (new closure) never re-arms the
  // watcher — only `enabled`/`timeoutMinutes` changes do.
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

  useEffect(() => {
    if (!enabled) return
    const watcher = startIdleWatcher(timeoutMinutes, () => onTimeoutRef.current(), window)
    return () => watcher.stop()
  }, [enabled, timeoutMinutes])
}
