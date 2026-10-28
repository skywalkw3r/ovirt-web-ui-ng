import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

// Long enough to swallow keystrokes while a DSL term is typed out, short
// enough that results still feel live.
export const SEARCH_DEBOUNCE_MS = 400

// Search state for the VMs list, backed by a loose 'q' URL param so queries
// are shareable/bookmarkable. No route declares a search schema (router.tsx
// stays untouched), hence the strict: false read and the loosely typed write.
export function useVmSearch(): {
  // committed value from the URL — drives the API call
  query: string
  // live input value, debounced into the URL
  draft: string
  setDraft: (value: string) => void
  clear: () => void
} {
  const navigate = useNavigate()
  const params = useSearch({ strict: false }) as { q?: unknown }
  const query = typeof params.q === 'string' ? params.q : ''

  const [draft, setDraft] = useState(query)

  // External URL changes (back/forward, a pasted link) refill the input —
  // unless the draft holds unsent edits, which the debounce below is about
  // to publish anyway.
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    if (draft === prevQuery) setDraft(query)
    setPrevQuery(query)
  }

  // replace: true keeps each debounce tick from becoming a history entry;
  // writing undefined drops the param so a cleared search is a bare URL.
  useEffect(() => {
    if (draft === query) return
    const timer = setTimeout(() => {
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, q: draft || undefined }),
        replace: true,
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, query, navigate])

  // Clearing skips the debounce so the toolbar × and the empty state's
  // clear button feel immediate.
  const clear = () => {
    setDraft('')
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, q: undefined }),
      replace: true,
    })
  }

  return { query, draft, setDraft, clear }
}
