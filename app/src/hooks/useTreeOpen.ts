import { useCallback, useState } from 'react'

// Whether a page's left tree panel is expanded, persisted per area.
//
// The two inventory surfaces (VMs & Templates, Hosts & Clusters) are ONE
// surface split across two routes, so they share the area key: collapsing the
// tree and then switching views through InventoryViewSwitcher used to remount
// the other page at its useState(true) default and re-expand the tree,
// throwing away the choice the user had just made. Persisting (rather than
// lifting into a provider) also carries the choice across reloads and
// deep links, which is the same posture as the column prefs beside it.
//
// localStorage, one JSON object keyed by area: { "inventory": false }. Only
// explicit `false` collapses — a missing or malformed entry means "open",
// so a corrupted store degrades to the stock layout instead of a blank rail.
const STORAGE_KEY = 'console-tree-open'

function readStore(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const store: Record<string, boolean> = {}
    for (const [area, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') store[area] = value
    }
    return store
  } catch {
    return {}
  }
}

export function useTreeOpen(area: string): [boolean, () => void] {
  const [isOpen, setIsOpen] = useState<boolean>(() => readStore()[area] ?? true)

  const toggle = useCallback(() => {
    setIsOpen((open) => {
      const next = !open
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStore(), [area]: next }))
      } catch {
        // a full/blocked store costs the persistence, not the toggle
      }
      return next
    })
  }, [area])

  return [isOpen, toggle]
}
