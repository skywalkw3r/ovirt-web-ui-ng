import { useEffect, useState } from 'react'

// The 10s polls alone can't keep relative timestamps fresh: TanStack Query's
// structural sharing returns the same data reference when a refetch comes
// back unchanged, so no tracked property changes and the component never
// re-renders. This ticker forces a re-render every intervalMs regardless.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
