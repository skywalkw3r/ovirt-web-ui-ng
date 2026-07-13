// Native oVirt DWH history via Grafana's query API. Same-origin, so the
// browser sends the grafana_session cookie (credentials:'include'); CSP
// connect-src 'self' already covers it (no iframe, no CSP surface).

export interface DwhPanel {
  id: number
  title: string
  type: string
  rawSql: string
}

// Everything the app needs from a dashboard definition: the selected panels'
// SQL, the dashboard's template-variable defaults (substituted into that SQL
// alongside the entity id), and the datasource the panels point at.
export interface DwhDashboard {
  panels: DwhPanel[]
  vars: Record<string, string>
  // resolved from panel refs or the datasource-type template variable;
  // undefined → the caller's fallback (the oVirt-provisioned DWH uid)
  datasourceUid?: string
}

export interface DwhSeries {
  name: string
  points: { x: number; y: number }[]
}

export interface DwhChart {
  panelId: number
  title: string
  // true → time series (line chart); false → a single gauge value
  time: boolean
  series: DwhSeries[]
  value?: number
}

// Grafana answers 401/403 when there is no grafana_session yet (its sign-in is
// separate from the engine SPA's bearer token — a one-time top-level visit to
// the portal establishes it via SSO). The UI turns this into a "sign in to
// Grafana" call-to-action instead of a raw error.
export class GrafanaAuthError extends Error {}

const DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_MOCK === '1'
const DATASOURCE_TYPE = 'grafana-postgresql-datasource'

// --- Grafana wire shapes (narrowed loosely at the boundary) -----------------
interface RawPanel {
  id?: number
  title?: string
  type?: string
  panels?: RawPanel[]
  targets?: { rawSql?: string }[]
  // modern form is { uid }; legacy dashboards may carry a bare name string
  datasource?: { uid?: string } | string | null
}
interface RawTemplateVar {
  name?: string
  type?: string
  current?: { value?: unknown }
}
interface RawField {
  name?: string
  type?: string
}
interface RawFrame {
  schema?: { fields?: RawField[] }
  data?: { values?: unknown[][] }
}

// The oVirt dashboard's time-series panels are titled "... (over time)"
// (e.g. "Average and Peak CPU Usage (over time)"). That suffix is redundant on
// a history chart and eats horizontal space, so trim a trailing "over time"
// (with or without parentheses) for the card heading. The \b guards against
// clipping words like "Discover time".
export function cleanPanelTitle(title: string | undefined): string {
  return (title ?? '').replace(/\s*\(?\s*\bover\s+time\b\s*\)?\s*$/i, '').trim()
}

// A usable datasource uid is a literal — not the unresolved '${datasource}'
// template reference the oVirt dashboards use panel-side, and not the
// 'default' sentinel a saved variable may hold (neither is accepted by
// /api/ds/query).
function literalUid(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' && value !== 'default' && !value.includes('$')
    ? value
    : undefined
}

// A template variable's current value, as a string usable in SQL. Multi-value
// selections join with commas (matching Grafana's default SQL formatting);
// unresolved '$__all'-style values are dropped rather than substituted.
function varValue(value: unknown): string | undefined {
  const flat = Array.isArray(value) ? value.join(',') : value
  return typeof flat === 'string' && flat !== '' && !flat.includes('$') ? flat : undefined
}

// Extract the requested panels (first target's rawSql), the template-variable
// defaults, and the datasource uid from a /api/dashboards/uid response — all
// read from the dashboard definition so the app never hardcodes the DWH
// schema, variable set, or datasource wiring.
export function parseDashboard(body: unknown, panelIds: number[]): DwhDashboard {
  const root = body as {
    dashboard?: { panels?: RawPanel[]; templating?: { list?: RawTemplateVar[] } }
    panels?: RawPanel[]
    templating?: { list?: RawTemplateVar[] }
  }
  const dashboard = root.dashboard ?? root
  const flat: RawPanel[] = []
  const walk = (panels: RawPanel[] | undefined) => {
    for (const panel of panels ?? []) {
      if (panel.type === 'row') walk(panel.panels)
      else flat.push(panel)
    }
  }
  walk(dashboard.panels)
  const wanted = new Set(panelIds)
  const selected = flat.filter(
    (panel): panel is RawPanel & { id: number } => panel.id !== undefined && wanted.has(panel.id),
  )
  const panels = selected
    .map((panel) => ({
      id: panel.id,
      title: cleanPanelTitle(panel.title) || `Panel ${panel.id}`,
      type: panel.type ?? 'graph',
      rawSql: panel.targets?.[0]?.rawSql ?? '',
    }))
    .filter((panel) => panel.rawSql !== '')

  const templating = dashboard.templating?.list ?? []
  const vars: Record<string, string> = {}
  let datasourceUid: string | undefined
  for (const entry of templating) {
    if (entry.name === undefined) continue
    if (entry.type === 'datasource') {
      datasourceUid ??= literalUid(
        Array.isArray(entry.current?.value) ? entry.current.value[0] : entry.current?.value,
      )
      continue
    }
    const value = varValue(entry.current?.value)
    if (value !== undefined) vars[entry.name] = value
  }
  // a panel-level literal uid (rare in the stock dashboards, which template
  // the datasource) beats the variable's saved value
  for (const panel of selected) {
    const ref = panel.datasource
    const uid = typeof ref === 'object' && ref !== null ? literalUid(ref.uid) : undefined
    if (uid !== undefined) {
      datasourceUid = uid
      break
    }
  }
  return { panels, vars, datasourceUid }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Substitute Grafana template variables ($name and ${name}) into panel SQL.
// Grafana's UI does this before a query runs; calling /api/ds/query directly
// makes it our job. The \b keeps a shorter name from clobbering a longer one
// ($vm never matches inside $vm_id); replacement is via callback so '$' in a
// value is never treated as a regex replacement pattern.
export function substituteVars(sql: string, vars: Record<string, string>): string {
  let out = sql
  for (const [name, value] of Object.entries(vars)) {
    out = out
      .replace(new RegExp(`\\$\\{${escapeRegExp(name)}\\}`, 'g'), () => value)
      .replace(new RegExp(`\\$${escapeRegExp(name)}\\b`, 'g'), () => value)
  }
  return out
}

// Fetch the configured dashboard's definition. 401/403 → GrafanaAuthError
// (no grafana_session yet); other non-2xx → plain Error.
export async function fetchDashboard(
  baseUrl: string,
  dashboardUid: string,
  panelIds: number[],
  signal?: AbortSignal,
): Promise<DwhDashboard> {
  if (DEV_MOCK) return mockDashboard(panelIds)
  const response = await fetch(
    `${baseUrl}/api/dashboards/uid/${encodeURIComponent(dashboardUid)}`,
    {
      credentials: 'include',
      signal,
      headers: { Accept: 'application/json' },
    },
  )
  if (response.status === 401 || response.status === 403) {
    throw new GrafanaAuthError(`Grafana sign-in required (HTTP ${response.status})`)
  }
  if (!response.ok) throw new Error(`Grafana dashboard fetch failed (HTTP ${response.status})`)
  return parseDashboard(await response.json(), panelIds)
}

// Run every panel's query in ONE batched /api/ds/query request. Grafana
// expands the $__time* macros server-side; dashboard template variables are
// substituted here (entity id included) via substituteVars. Returns one chart
// per panel (a line-series set, or a gauge value).
export async function queryDwhPanels(
  baseUrl: string,
  datasourceUid: string,
  panels: DwhPanel[],
  vars: Record<string, string>,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<DwhChart[]> {
  if (panels.length === 0) return []
  if (DEV_MOCK) return panels.map((panel) => mockChart(panel))
  const queries = panels.map((panel) => ({
    refId: String(panel.id),
    datasource: { uid: datasourceUid, type: DATASOURCE_TYPE },
    rawSql: substituteVars(panel.rawSql, vars),
    format: panel.type === 'gauge' ? 'table' : 'time_series',
    intervalMs: 60_000,
    maxDataPoints: 500,
  }))
  const response = await fetch(`${baseUrl}/api/ds/query`, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ queries, from, to }),
  })
  if (response.status === 401 || response.status === 403) {
    throw new GrafanaAuthError(`Grafana sign-in required (HTTP ${response.status})`)
  }
  if (!response.ok) throw new Error(`Grafana query failed (HTTP ${response.status})`)
  const body = (await response.json()) as { results?: Record<string, { frames?: RawFrame[] }> }
  return panels.map((panel) => parseChart(panel, body.results?.[String(panel.id)]?.frames ?? []))
}

// Turn Grafana's column-oriented frames into chart-ready series. Gauge panels
// yield a single value; graph panels yield a { name, points } per numeric field
// (merged across a panel's frames, sorted by time).
export function parseChart(panel: DwhPanel, frames: RawFrame[]): DwhChart {
  const isTime = panel.type !== 'gauge'
  const series: DwhSeries[] = []
  let value: number | undefined
  for (const frame of frames) {
    const fields = frame.schema?.fields ?? []
    const values = frame.data?.values ?? []
    if (!isTime) {
      const numIdx = fields.findIndex((field) => field.type === 'number')
      const col = numIdx >= 0 ? values[numIdx] : undefined
      if (col && col.length > 0) value = Number(col[col.length - 1])
      continue
    }
    const timeIdx = fields.findIndex((field) => field.type === 'time')
    const timeCol = timeIdx >= 0 ? values[timeIdx] : undefined
    fields.forEach((field, index) => {
      if (field.type !== 'number') return
      const col = values[index] ?? []
      const points = col
        .map((raw, j) => ({ x: timeCol ? Number(timeCol[j]) : j, y: Number(raw) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      const name = field.name ?? ''
      const existing = series.find((entry) => entry.name === name)
      if (existing) existing.points.push(...points)
      else series.push({ name, points })
    })
  }
  for (const entry of series) entry.points.sort((a, b) => a.x - b.x)
  return { panelId: panel.id, title: panel.title, time: isTime, series, value }
}

// --- dev:mock synthetic data (no real Grafana under dev:mock) ---------------
const MOCK_GAUGES = new Set([7, 8, 18])
// Graph titles carry the real dashboard's "(over time)" suffix so the mock
// exercises cleanPanelTitle; gauges (7/8/18) never have it.
const MOCK_TITLES: Record<number, string> = {
  7: 'CPU Usage',
  8: 'Memory Usage',
  18: 'Disk Usage',
  14: 'Average and Peak CPU Usage (over time)',
  20: 'Average and Peak Memory Usage (over time)',
  19: 'Disk Read and Write Rates (over time)',
  33: 'Disk I/O operations (over time)',
  21: 'Ethernet Tx and Rx Rates (over time)',
  40: 'Ethernet Tx and Rx Dropped Packets (over time)',
}
function mockDashboard(panelIds: number[]): DwhDashboard {
  return {
    panels: panelIds.map((id) => ({
      id,
      title: cleanPanelTitle(MOCK_TITLES[id]) || `Panel ${id}`,
      type: MOCK_GAUGES.has(id) ? 'gauge' : 'graph',
      rawSql: 'mock',
    })),
    vars: {},
  }
}
function mockChart(panel: DwhPanel): DwhChart {
  if (panel.type === 'gauge') {
    return {
      panelId: panel.id,
      title: panel.title,
      time: false,
      series: [],
      value: 20 + Math.random() * 60,
    }
  }
  const now = Date.now()
  const names =
    panel.id === 14
      ? ['CPU Usage', 'CPU Peak']
      : panel.id === 20
        ? ['Memory Usage', 'Memory Peak']
        : ['Rate A', 'Rate B']
  const series = names.map((name, offset) => {
    let v = 20 + offset * 15 + Math.random() * 20
    const points = Array.from({ length: 120 }, (_, i) => {
      v = Math.max(0, Math.min(100, v + (Math.random() - 0.5) * 8))
      return { x: now - (120 - i) * 60_000, y: Math.round(v * 10) / 10 }
    })
    return { name, points }
  })
  return { panelId: panel.id, title: panel.title, time: true, series }
}
