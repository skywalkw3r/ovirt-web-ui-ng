import { useEffect } from 'react'
import { installGlobalErrorHandlers } from './globalErrors'
import { useNotify } from '../notifications/context'

// Bridges the global window error handlers into the notification system. It
// must render inside NotificationProvider (so useNotify resolves), installs the
// listeners once on mount, and tears them down on unmount — keeping StrictMode's
// double-invoke and hot-reload from stacking duplicate listeners. Renders
// nothing.
export function GlobalErrorBridge() {
  const { notify } = useNotify()
  useEffect(() => installGlobalErrorHandlers(notify), [notify])
  return null
}
