// Faceted list filtering — the engine behind the inventory toolbar's filter
// dropdowns (webadmin's search DSL, made discoverable).
//
// Deliberately NOT per-column header filters: the inventory grids are
// resizable single-line tables whose columns can be hidden, so a filter
// living in a <Th> disappears with its column and fights the drag handle.
// Facets are declared beside the column catalog instead and stay reachable
// whatever the grid looks like.
//
// Semantics, the standard faceted-search contract: OR within one facet
// (Status: Running OR Powered off), AND across facets (that status set AND
// cluster Default). An empty value set means the facet is off entirely.
//
// Pure functions over already-fetched rows — no React, no network. The
// inventory view holds its whole collection client-side anyway (the folder
// tree and name filter already derive from it), so faceting is one more
// synchronous pass and needs no engine round-trip.

// value → the raw, stable key stored in the URL (an entity id or an engine
// enum, never a display name — those are localized/renamable)
export type FacetSelection = Readonly<Record<string, readonly string[]>>

export interface FacetDef<Row, Ctx> {
  key: string
  // Values this row carries for the facet. Multi-valued facets are allowed
  // (a row matches if ANY of its values is selected); an empty array means
  // the row has no value here and so never matches an active facet.
  valuesOf: (row: Row, ctx: Ctx) => readonly string[]
  // Display label for a raw value. Defaults to the value itself.
  labelOf?: (value: string, ctx: Ctx) => string
  // Fixed option order (e.g. the engine's status progression); values
  // outside it sort after, alphabetically by label.
  order?: readonly string[]
}

export interface FacetOption {
  value: string
  label: string
  // How many rows this option would leave visible — counted against the rows
  // matching every OTHER active facet, so the numbers describe what clicking
  // it actually does rather than the unfiltered collection.
  count: number
  // count 0 and not currently selected: listed, but picking it could only
  // empty the table
  isDisabled: boolean
}

export interface FacetView {
  key: string
  options: FacetOption[]
  selected: readonly string[]
}

const selectedFor = (selection: FacetSelection, key: string): readonly string[] =>
  selection[key] ?? []

function matchesFacet<Row, Ctx>(
  row: Row,
  ctx: Ctx,
  facet: FacetDef<Row, Ctx>,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true
  return facet.valuesOf(row, ctx).some((value) => selected.includes(value))
}

// Does the row survive every active facet? (The name filter and folder
// subtree stay the caller's business — they compose by plain &&.)
export function matchesFacets<Row, Ctx>(
  row: Row,
  ctx: Ctx,
  facets: readonly FacetDef<Row, Ctx>[],
  selection: FacetSelection,
): boolean {
  return facets.every((facet) => matchesFacet(row, ctx, facet, selectedFor(selection, facet.key)))
}

// One view per facet: every value present in the rows, labelled, counted and
// ordered, plus what is currently selected.
//
// Two different row sets are at work, and the split is what keeps the toolbar
// still while you use it:
//   * which OPTIONS exist — every value in the passed rows, so the menus are
//     derived from the data (no cluster nobody has a VM in) but do not shift
//     as filters are applied. A facet whose menu emptied out would otherwise
//     vanish from the toolbar mid-click.
//   * each option's COUNT — rows passing every OTHER active facet, so the
//     number says what clicking it would leave. A facet's own selection never
//     narrows its own menu, or picking "Running" would hide "Powered off"
//     from the dropdown it was just picked in.
// An option at count 0 stays listed but is dead (isDisabled): it explains why
// something is missing instead of silently disappearing. A SELECTED value is
// never disabled and never dropped, even at count 0 — the chip has to stay
// clickable to be removable.
export function buildFacetViews<Row, Ctx>(
  facets: readonly FacetDef<Row, Ctx>[],
  rows: readonly Row[],
  ctx: Ctx,
  selection: FacetSelection,
): FacetView[] {
  return facets.map((facet) => {
    const selected = selectedFor(selection, facet.key)
    const others = facets.filter((other) => other.key !== facet.key)
    const scoped = rows.filter((row) => matchesFacets(row, ctx, others, selection))

    // one row counts once per distinct value it carries
    const valuesOf = (row: Row) => new Set(facet.valuesOf(row, ctx))
    const present = new Set<string>(selected)
    for (const row of rows) for (const value of valuesOf(row)) present.add(value)
    const counts = new Map<string, number>()
    for (const row of scoped) {
      for (const value of valuesOf(row)) counts.set(value, (counts.get(value) ?? 0) + 1)
    }

    const label = (value: string) => facet.labelOf?.(value, ctx) ?? value
    const options: FacetOption[] = [...present].map((value) => {
      const count = counts.get(value) ?? 0
      return {
        value,
        label: label(value),
        count,
        isDisabled: count === 0 && !selected.includes(value),
      }
    })

    const rank = (value: string) => {
      const index = facet.order?.indexOf(value) ?? -1
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }
    options.sort(
      (a, b) =>
        rank(a.value) - rank(b.value) ||
        a.label.localeCompare(b.label, undefined, { numeric: true }),
    )

    return { key: facet.key, options, selected }
  })
}

export function activeFacetCount(selection: FacetSelection): number {
  return Object.values(selection).reduce((total, values) => total + values.length, 0)
}

// Add/remove one value, dropping emptied facets so the encoded form (and the
// "any filters active?" check) stays canonical.
export function toggleFacetValue(
  selection: FacetSelection,
  key: string,
  value: string,
): FacetSelection {
  const current = selectedFor(selection, key)
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value]
  const result: Record<string, readonly string[]> = { ...selection }
  if (next.length === 0) delete result[key]
  else result[key] = next
  return result
}

export function clearFacet(selection: FacetSelection, key: string): FacetSelection {
  const result: Record<string, readonly string[]> = { ...selection }
  delete result[key]
  return result
}

// URL codec: one compact param, `status:up,down;cluster:<uuid>`. Values are
// entity ids and engine enums (never free text), so ',' ':' and ';' can't
// occur inside one — a value containing a separator is dropped on parse
// rather than silently splitting into two filters.
const FACET_SEPARATOR = ';'
const KEY_SEPARATOR = ':'
const VALUE_SEPARATOR = ','

export function encodeFacets(selection: FacetSelection): string | undefined {
  const parts = Object.entries(selection)
    .filter(([, values]) => values.length > 0)
    // sorted so the same filter set always produces the same URL (bookmarks,
    // history entries and query keys compare equal)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => `${key}${KEY_SEPARATOR}${[...values].sort().join(VALUE_SEPARATOR)}`)
  return parts.length > 0 ? parts.join(FACET_SEPARATOR) : undefined
}

// Defensive parse — this is user-editable URL text. Unknown keys are kept
// (the caller matches them against its facet catalog and ignores strays);
// malformed segments are skipped individually.
export function decodeFacets(raw: unknown): FacetSelection {
  if (typeof raw !== 'string' || raw === '') return {}
  const selection: Record<string, readonly string[]> = {}
  for (const part of raw.split(FACET_SEPARATOR)) {
    const at = part.indexOf(KEY_SEPARATOR)
    if (at <= 0) continue
    const key = part.slice(0, at)
    const values = [
      ...new Set(
        part
          .slice(at + 1)
          .split(VALUE_SEPARATOR)
          .filter(Boolean),
      ),
    ]
    if (values.length > 0) selection[key] = values
  }
  return selection
}
