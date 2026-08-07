import type { Notification } from '../notifications/context'

// Minimum gap between global-error toasts. A single failing render can fire a
// burst of unhandledrejection/error events; without throttling the user would
// get a wall of identical danger toasts. One every 10s is enough to signal
// "something is wrong" without drowning the drawer.
export const GLOBAL_ERROR_THROTTLE_MS = 10_000

type Notify = (n: Notification) => void

// Installs window-level listeners that catch errors escaping React's own
// boundaries — unhandled promise rejections and uncaught runtime errors — and
// surfaces a single, throttled danger toast through the notification system.
// Called once from the integration layer with the app's `notify`. Returns a
// teardown so tests (and hot-reload) can detach the listeners.
export function installGlobalErrorHandlers(notify: Notify): () => void {
  let lastNotifiedAt = 0

  function surface() {
    const now = Date.now()
    if (now - lastNotifiedAt < GLOBAL_ERROR_THROTTLE_MS) return
    lastNotifiedAt = now
    notify({ title: 'Something went wrong', variant: 'danger' })
  }

  function handleRejection(_event: PromiseRejectionEvent) {
    surface()
  }

  function handleError(_event: ErrorEvent) {
    surface()
  }

  window.addEventListener('unhandledrejection', handleRejection)
  window.addEventListener('error', handleError)

  return () => {
    window.removeEventListener('unhandledrejection', handleRejection)
    window.removeEventListener('error', handleError)
  }
}
