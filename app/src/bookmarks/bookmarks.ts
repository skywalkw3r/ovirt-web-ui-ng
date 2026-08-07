// Per-area saved searches, mirroring webadmin's Bookmarks pane: each list
// page (area: 'vms', 'events', …) keeps its own named engine-DSL queries.
// localStorage-backed for now, same posture as settings/SettingsProvider.tsx
// (engine user-options roaming is a later phase). Pure functions, no React —
// components hold the returned lists in their own state.

export interface Bookmark {
  name: string
  query: string
}

const STORAGE_KEY = 'console-bookmarks'

// One JSON object under a single key, keyed by area:
// { "vms": [{ name, query }, …], "events": […] }
type BookmarkStore = Record<string, Bookmark[]>

function isBookmark(entry: unknown): entry is Bookmark {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as { name?: unknown }).name === 'string' &&
    typeof (entry as { query?: unknown }).query === 'string'
  )
}

// Defensive parse, same spirit as SettingsProvider initialSettings: malformed
// JSON or a non-object root degrades to {}, and wrong-shaped entries are
// dropped per-area rather than poisoning the whole store.
function readStore(): BookmarkStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const store: BookmarkStore = {}
    for (const [area, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) store[area] = value.filter(isBookmark)
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: BookmarkStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listBookmarks(area: string): Bookmark[] {
  return readStore()[area] ?? []
}

// Upsert by name: an existing bookmark keeps its position in the list, a new
// one appends. Returns the persisted list so callers can adopt it as state.
export function saveBookmark(area: string, bookmark: Bookmark): Bookmark[] {
  const store = readStore()
  const current = store[area] ?? []
  const exists = current.some((entry) => entry.name === bookmark.name)
  const next = exists
    ? current.map((entry) => (entry.name === bookmark.name ? bookmark : entry))
    : [...current, bookmark]
  store[area] = next
  writeStore(store)
  return next
}

export function removeBookmark(area: string, name: string): Bookmark[] {
  const store = readStore()
  const next = (store[area] ?? []).filter((entry) => entry.name !== name)
  store[area] = next
  writeStore(store)
  return next
}
