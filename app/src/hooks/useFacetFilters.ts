import { useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  clearFacet,
  decodeFacets,
  encodeFacets,
  toggleFacetValue,
  type FacetSelection,
} from '../lib/facets'

// Facet-filter state for a list page, backed by a loose 'filters' URL param
// (`status:up,down;cluster:<uuid>` — see lib/facets encodeFacets). Same
// posture as useListSearch's 'q' and useFolderParam's 'folder': no route
// schema, so router.tsx stays untouched and any list page can mount it.
//
// URL-backed rather than component state so a filtered view is shareable and
// bookmarkable — "every powered-off VM in cluster X" is a link you can paste
// into a ticket, and the toolbar's bookmark menu keeps working because it
// spreads the existing search params.
//
// Writes replace rather than push: clicking four checkboxes in one dropdown
// visit shouldn't cost four Back presses to escape.
export function useFacetFilters(): {
  selection: FacetSelection
  toggle: (key: string, value: string) => void
  clear: (key: string) => void
  clearAll: () => void
} {
  const navigate = useNavigate()
  const params = useSearch({ strict: false }) as { filters?: unknown }
  const raw = typeof params.filters === 'string' ? params.filters : ''
  const fromUrl = useMemo(() => decodeFacets(raw), [raw])

  // The navigation is async, so two checkbox clicks landing in the same frame
  // would both read the pre-click URL and the second would overwrite the
  // first. Staging the selection in state — published to the URL, then
  // re-synced from it — makes each toggle build on the last, and renders the
  // new checkbox immediately instead of a frame later. Same same-tick problem
  // useListSearch solves with its draft ref.
  const [staged, setStaged] = useState(fromUrl)
  // The URL stays the authority: back/forward, a pasted link or an applied
  // bookmark all overwrite whatever was staged (render-time state adjustment,
  // the pattern the list pages already use for their paging resets).
  const [prevRaw, setPrevRaw] = useState(raw)
  if (raw !== prevRaw) {
    setPrevRaw(raw)
    setStaged(fromUrl)
  }

  const publish = (next: FacetSelection) => {
    setStaged(next)
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, filters: encodeFacets(next) }),
      replace: true,
    })
  }

  return {
    selection: staged,
    toggle: (key, value) => publish(toggleFacetValue(staged, key, value)),
    clear: (key) => publish(clearFacet(staged, key)),
    clearAll: () => publish({}),
  }
}
