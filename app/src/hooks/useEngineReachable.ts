import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// Mock mode talks to an in-memory handler that never fails the way a dead
// engine does — treat it as always reachable so the offline banner never
// flashes during dev/mock or e2e runs.
const IS_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'

// Consecutive failed fetches (across all queries) before we declare the engine
// unreachable. One transient blip shouldn't raise the banner; three in a row
// means the engine is genuinely down.
export const UNREACHABLE_THRESHOLD = 3

// Reachability signal for the OfflineBanner. Watches the QueryClient cache:
// every query that errors bumps a consecutive-failure counter, any success
// resets it, and crossing the threshold flips `unreachable`. A false
// navigator.onLine is an immediate, unconditional trip. Recovery (a success or
// the browser coming back online) clears it.
export function useEngineReachable(): boolean {
  const queryClient = useQueryClient()
  const [failures, setFailures] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    if (IS_MOCK) return

    const cache = queryClient.getQueryCache()
    const unsubscribe = cache.subscribe((event) => {
      // Only react to a query settling — the 'updated' event fires with an
      // action describing what happened to the query's fetch.
      if (event.type !== 'updated') return
      const status = event.query.state.status
      if (status === 'error') {
        setFailures((n) => n + 1)
      } else if (status === 'success') {
        setFailures(0)
      }
    })
    return unsubscribe
  }, [queryClient])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (IS_MOCK) return true
  if (!online) return false
  return failures < UNREACHABLE_THRESHOLD
}
