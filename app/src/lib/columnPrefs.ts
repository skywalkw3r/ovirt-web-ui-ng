// Per-area column preferences, mirroring webadmin's per-grid column controls:
// each list page (area: 'storage-domains', 'vms', …) keeps its own list of
// visible column keys and, once the user has dragged a header edge, a map of
// column-key → pixel width. localStorage-backed, same posture and defensive
// parsing as bookmarks/bookmarks.ts. Pure functions, no React — the
// useColumnPrefs hook holds the returned values in component state.

const STORAGE_KEY = 'console-columns'

// One JSON object under a single key, keyed by area:
//   { "vms": { "visible": ["name", "status"], "widths": { "name": 320 } } }
// The pre-widths store held a bare visible-keys array per area
// ({ "vms": ["name", …] }); parseArea migrates that shape on the fly so saved
// visibility preferences survive the upgrade without a one-shot rewrite.
interface AreaPrefs {
  visible?: string[]
  widths?: Record<string, number>
}
type ColumnPrefStore = Record<string, AreaPrefs>

// widths must be finite positive numbers; junk entries drop individually so
// one bad key can't discard the user's other drag work
function parseWidths(value: unknown): Record<string, number> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const widths: Record<string, number> = {}
  for (const [key, px] of Object.entries(value as Record<string, unknown>)) {
    if (typeof px === 'number' && Number.isFinite(px) && px > 0) widths[key] = px
  }
  return Object.keys(widths).length > 0 ? widths : undefined
}

function parseArea(value: unknown): AreaPrefs | undefined {
  // legacy shape: the area's value is the visible-keys array itself
  if (Array.isArray(value)) {
    return { visible: value.filter((key) => typeof key === 'string') }
  }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const area: AreaPrefs = {}
  if (Array.isArray(record.visible)) {
    area.visible = record.visible.filter((key) => typeof key === 'string')
  }
  const widths = parseWidths(record.widths)
  if (widths !== undefined) area.widths = widths
  return area.visible !== undefined || area.widths !== undefined ? area : undefined
}

// Defensive parse, same spirit as bookmarks.ts readStore: malformed JSON or a
// non-object root degrades to {}, and wrong-shaped entries are dropped
// per-area rather than poisoning the whole store.
function readStore(): ColumnPrefStore {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const store: ColumnPrefStore = {}
    for (const [area, value] of Object.entries(parsed as Record<string, unknown>)) {
      const prefs = parseArea(value)
      if (prefs !== undefined) store[area] = prefs
    }
    return store
  } catch {
    return {}
  }
}

function writeStore(store: ColumnPrefStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

// null means "no preference saved" — the caller falls back to its defaults
// (all columns visible). A malformed or wrong-shaped store also reads as null.
export function loadColumnPrefs(area: string): string[] | null {
  return readStore()[area]?.visible ?? null
}

export function saveColumnPrefs(area: string, keys: string[]): void {
  const store = readStore()
  store[area] = { ...store[area], visible: keys }
  writeStore(store)
}

// {} means "no widths saved" — the table stays in fluid (auto) layout.
export function loadColumnWidths(area: string): Record<string, number> {
  return readStore()[area]?.widths ?? {}
}

// Widths are saved whole (the hook owns the merged map); an empty map removes
// the field so hasWidths and the fluid/fixed layout switch derive cleanly.
export function saveColumnWidths(area: string, widths: Record<string, number>): void {
  const store = readStore()
  const entry: AreaPrefs = { ...store[area] }
  if (Object.keys(widths).length > 0) {
    entry.widths = widths
  } else {
    delete entry.widths
  }
  if (entry.visible !== undefined || entry.widths !== undefined) {
    store[area] = entry
  } else {
    delete store[area]
  }
  writeStore(store)
}

// Drops the area's preference entirely — visibility AND widths — so the next
// load returns the defaults again. This is the ColumnPicker Reset semantics:
// one action restores the stock grid.
export function clearColumnPrefs(area: string): void {
  const store = readStore()
  delete store[area]
  writeStore(store)
}
