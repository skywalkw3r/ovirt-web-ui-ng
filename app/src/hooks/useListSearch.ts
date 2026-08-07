import { useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

// Search state for a list page, backed by a loose 'q' URL param so queries
// are shareable/bookmarkable — useVmSearch's committed-query-in-URL pattern,
// minus the debounce: the shared SearchInput commits explicitly (Enter, the
// search button, or clear). No route declares a search schema (router.tsx
// stays untouched), hence the strict: false read and the loosely typed
// write; 'to: .' keeps the hook route-agnostic, so any list page can mount
// it. Grew out of useEventSearch when list search rolled onto the other
// collections — that module re-exports this one.
export function useListSearch(): {
  // committed value from the URL — drives the API call
  query: string
  // live input value; published to the URL only on commit
  draft: string
  setDraft: (value: string) => void
  // publish the current draft to the URL
  commit: () => void
  // refill the input and publish in one step (bookmark apply)
  apply: (value: string) => void
} {
  const navigate = useNavigate()
  const params = useSearch({ strict: false }) as { q?: unknown }
  const query = typeof params.q === 'string' ? params.q : ''

  const [draft, setDraftState] = useState(query)
  // SearchInput's clear fires onChange('') then onCommit() in the same tick,
  // so commit must read the just-set draft, not this render's state — the
  // ref mirrors the draft for that same-tick read.
  const draftRef = useRef(draft)
  const setDraft = (value: string) => {
    draftRef.current = value
    setDraftState(value)
  }

  // External URL changes (back/forward, a pasted link) refill the input.
  // With explicit commits there is no in-flight debounce to protect, so the
  // URL wins unconditionally.
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setDraft(query)
    setPrevQuery(query)
  }

  // replace: true keeps repeated commits from piling up history entries;
  // writing undefined drops the param so a cleared search is a bare URL.
  const publish = (value: string) => {
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, q: value || undefined }),
      replace: true,
    })
  }

  const commit = () => publish(draftRef.current)

  const apply = (value: string) => {
    setDraft(value)
    publish(value)
  }

  return { query, draft, setDraft, commit, apply }
}
