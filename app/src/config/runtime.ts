import { z } from 'zod'

// Deployment-provided runtime config. Everything else in this app is build-time
// (import.meta.env); this is the one runtime seam. A deployer sets
// window.ovirtWebUiConfig via a non-content-hashed config.js at deploy time —
// no rebuild — exactly mirroring how the engine injects window.userInfo for SSO
// (see auth/bootstrap.ts). It is validated/narrowed here at the trust boundary.

// 'off' hides the history surface entirely; 'on' always renders it (an
// unreachable Grafana shows the unavailable state); 'auto' — the default —
// renders it only when the /api/health probe finds a live Grafana, so a stock
// engine with DWH/Grafana installed gets history with zero configuration and a
// DWH-less engine shows nothing.
export type MonitoringMode = 'on' | 'off' | 'auto'

// Native history charts for one entity kind: a Grafana dashboard UID plus the
// panel ids to render. The app reads each panel's SQL (and the dashboard's
// template-variable defaults and datasource) from the dashboard definition at
// runtime, then substitutes the entity GUID for the `idVar` template variable.
export interface QuerySpec {
  dashboardUid: string
  panelIds: number[]
  // dashboard template variable carrying the entity GUID, without the leading $
  idVar: string
}

export interface MonitoringConfig {
  // same-origin path (default) or absolute http(s) URL to the oVirt Grafana
  grafanaBaseUrl: string
  enabled: MonitoringMode
  // vm defaults to the stock oVirt 4.5 VM dashboard (verified in-lab);
  // host/cluster render only when a deployer configures them — their stock
  // UIDs/variables vary by version, so they ship unset (see config.js).
  queries: { vm: QuerySpec; host?: QuerySpec; cluster?: QuerySpec }
}

// Multi-engine support: a deployer-listed oVirt engine this console may
// connect to. The list comes ONLY from config.js — users cannot add servers
// in the browser (deliberate: the CSP connect-src allowlist and the engines'
// CORSAllowedOrigins are provisioned per deployment, so an arbitrary
// user-typed URL could never work and would only widen the attack surface).
// An empty list (the default) disables the picker entirely and the console
// talks same-origin, exactly as before this feature existed.
export interface ServerEntry {
  // display label for the login-page picker and the masthead
  name: string
  // fetch prefix for every API/SSO call, in one of three forms:
  //   '' — the server IS the page's own origin (integrated same-origin path;
  //        keeps window.userInfo bootstrap, the dev proxy, CSP 'self');
  //   '/e/<slug>' — a same-origin PATH prefix the console's reverse proxy maps
  //        to this engine (nginx `location /e/<slug>/ { proxy_pass … }`). Every
  //        call stays same-origin, so NO CORS and CSP can stay 'self' — the
  //        preferred multi-engine shape behind our proxy;
  //   'https://engine.example.com' — the engine's own origin (browser talks to
  //        it DIRECTLY; requires per-engine CORS + a CSP connect-src entry).
  base: string
  // Default oVirt AAA profile for this engine, appended to the username as
  // `user@profile` at login (the SSO http grant resolves the profile from the
  // suffix). The login form pre-selects it when this engine is picked; the
  // user can still override to a local/other profile. Optional — omit to fall
  // back to the form's generic default.
  profile?: string
}

// Deploy-time login-screen content, shown pre-auth (before any token exists),
// identical for every user and every configured engine. Unlike the platform
// settings notice — which is per-engine, admin-set, and only reaches the login
// page via a per-browser cache after an authenticated visit — this is truly
// global: it renders straight from config.js on the very first visit.
export interface LoginConfig {
  // Sign-in notice / banner text. Plain text (rendered escaped, whitespace
  // preserved); '' hides it. Empty by default.
  notice: string
}

export interface RuntimeConfig {
  monitoring: MonitoringConfig
  servers: ServerEntry[]
  login: LoginConfig
}

export type QueryEntity = keyof MonitoringConfig['queries']

const DEFAULT_GRAFANA_BASE_URL = '/ovirt-engine-grafana'

// The stock oVirt 4.5 VM dashboard: gauges (7 CPU, 8 memory, 18 disk) then the
// over-time graphs. UID, panel ids, and the vm_id variable are lab-verified.
const DEFAULT_VM_QUERY: QuerySpec = {
  dashboardUid: 'VirtualMachineDashboard',
  panelIds: [7, 8, 18, 14, 20, 19, 33, 21, 40],
  idVar: 'vm_id',
}

const DEFAULT_ID_VARS: Record<QueryEntity, string> = {
  vm: 'vm_id',
  host: 'host_id',
  cluster: 'cluster_id',
}

// Build-time default injected by Vite `define` (vite.config.ts). typeof-guarded
// so non-Vite consumers (vitest) don't ReferenceError — same pattern as
// __COMPONENT_VERSIONS__ in lib/version.ts.
function buildDefault(): { grafanaBaseUrl?: string; enabled?: boolean } {
  return typeof __GRAFANA_DEFAULT__ !== 'undefined' ? __GRAFANA_DEFAULT__ : {}
}

// The base URL is rendered into an href (Open-in-Grafana link), so it crosses a
// trust boundary: accept only an absolute http(s) URL or a leading-slash
// same-origin path. Reject javascript:, data:, and protocol-relative //host
// (which escapes same-origin). Note the query/probe fetches are additionally
// bound by CSP connect-src 'self' — a cross-origin base only works for the
// link out, not for inline history charts.
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

// Trailing slashes are stripped from a path base so it concatenates cleanly
// with the fixed engine paths (`${base}/ovirt-engine/api`): '/e/bbn/' → '/e/bbn'.
function normalizePathBase(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  // A path that normalizes away entirely ('/' or '//') is the page root —
  // that is the same-origin default, expressed as '' like the origin case.
  return trimmed === '' ? '' : trimmed
}

// Resolve a configured server URL to the fetch prefix (base) every API/SSO call
// is stamped with. Three accepted forms, mapping to ServerEntry.base:
//   - a same-origin PATH ('/e/bbn'): kept verbatim (minus trailing slash) so
//     the request stays same-origin and the console's proxy routes it to the
//     engine — no CORS. Protocol-relative '//host' is rejected (it escapes the
//     origin); bare '/' collapses to '' (same-origin root).
//   - an absolute http(s) URL on the PAGE's own origin: collapses to its path
//     ('' when the path is just root) — same same-origin proxy semantics.
//   - an absolute http(s) URL on a DIFFERENT origin: the origin is kept (the
//     engine's fixed paths are appended), the direct-connect (CORS) shape.
// Anything else (javascript:, data:, garbage) drops the entry.
function serverBase(url: string | undefined): string | undefined {
  if (!url) return undefined
  // Same-origin path prefix (but not protocol-relative '//host').
  if (url.startsWith('/')) {
    return url.startsWith('//') ? undefined : normalizePathBase(url)
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (
      typeof window !== 'undefined' &&
      window.location !== undefined &&
      parsed.origin === window.location.origin
    ) {
      // Same origin as the page: keep any path (the proxy prefix), else ''.
      return normalizePathBase(parsed.pathname)
    }
    return parsed.origin
  } catch {
    return undefined
  }
}

const QuerySpecSchema = z.looseObject({
  dashboardUid: z.string(),
  panelIds: z.array(z.number()),
  idVar: z.string().optional(),
})

const InjectedConfigSchema = z
  .looseObject({
    monitoring: z
      .looseObject({
        grafanaBaseUrl: z.string().optional(),
        enabled: z.boolean().optional(),
        queries: z
          .looseObject({
            vm: QuerySpecSchema.optional(),
            host: QuerySpecSchema.optional(),
            cluster: QuerySpecSchema.optional(),
          })
          .optional(),
      })
      .optional(),
    servers: z
      .looseObject({
        list: z
          .array(
            z.looseObject({
              name: z.string().optional(),
              url: z.string().optional(),
              profile: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    login: z
      .looseObject({
        notice: z.string().optional(),
      })
      .optional(),
  })
  .optional()

type InjectedSpec = z.infer<typeof QuerySpecSchema>

// Multi-engine is a BUILD-TIME capability, not just a config switch: only
// proxy/external builds (the Containerfile sets VITE_MULTI_ENGINE=1; source
// builds may opt in) honor a configured server list. The integrated RPM on a
// hosted engine ships the default build, where this returns false, servers
// resolve to [] regardless of config.js, and the picker cannot exist — an
// engine-host install is single-engine by design. Read at call time (not a
// module const) so tests can stub the env per case.
function multiEngineCapable(): boolean {
  return import.meta.env.VITE_MULTI_ENGINE === '1'
}

// Narrow the injected server list: blank names and invalid URLs drop the
// entry, duplicate bases keep the first occurrence (a stable, predictable
// pick order for the login select). A blank/whitespace profile is dropped so
// it never composes an empty `user@` suffix.
function toServers(
  list: { name?: string; url?: string; profile?: string }[] | undefined,
): ServerEntry[] {
  if (!multiEngineCapable() || !list) return []
  const out: ServerEntry[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const name = item.name?.trim() ?? ''
    const base = serverBase(item.url)
    if (name === '' || base === undefined || seen.has(base)) continue
    seen.add(base)
    const profile = item.profile?.trim()
    // Omit the key entirely (not `profile: undefined`) so entries without a
    // profile keep the exact { name, base } shape existing tests assert on.
    out.push(profile ? { name, base, profile } : { name, base })
  }
  return out
}

function toSpec(entity: QueryEntity, injected: InjectedSpec | undefined): QuerySpec | undefined {
  if (injected === undefined) return undefined
  return {
    dashboardUid: injected.dashboardUid,
    panelIds: injected.panelIds,
    idVar: injected.idVar ?? DEFAULT_ID_VARS[entity],
  }
}

// config.js keeps the deployer-facing switch a plain boolean; absence means
// auto-detect via the health probe.
function toMode(enabled: boolean | undefined): MonitoringMode | undefined {
  if (enabled === undefined) return undefined
  return enabled ? 'on' : 'off'
}

// A defensive ceiling so a runaway config.js value can't blow up the login
// card; the notice is announcement text, not a document.
const MAX_LOGIN_NOTICE_CHARS = 2000

// Trim + cap; '' (the default) hides the banner. Rendered as escaped text in
// LoginPage, so no sanitization beyond length is needed.
function toLoginNotice(notice: string | undefined): string {
  return (notice ?? '').trim().slice(0, MAX_LOGIN_NOTICE_CHARS)
}

function resolve(): RuntimeConfig {
  const build = buildDefault()
  const injectedGlobal = typeof window !== 'undefined' ? window.ovirtWebUiConfig : undefined
  const parsed = InjectedConfigSchema.safeParse(injectedGlobal)
  const injected = parsed.success ? parsed.data?.monitoring : undefined
  const grafanaBaseUrl =
    safeUrl(injected?.grafanaBaseUrl) ?? safeUrl(build.grafanaBaseUrl) ?? DEFAULT_GRAFANA_BASE_URL
  return {
    monitoring: {
      grafanaBaseUrl,
      enabled: toMode(injected?.enabled) ?? toMode(build.enabled) ?? 'auto',
      queries: {
        vm: toSpec('vm', injected?.queries?.vm) ?? DEFAULT_VM_QUERY,
        host: toSpec('host', injected?.queries?.host),
        cluster: toSpec('cluster', injected?.queries?.cluster),
      },
    },
    servers: toServers(parsed.success ? parsed.data?.servers?.list : undefined),
    login: {
      notice: toLoginNotice(parsed.success ? parsed.data?.login?.notice : undefined),
    },
  }
}

// Config is static per page load, so memoize. The reader is called from render
// paths (useRuntimeConfig), and the returned primitives are what consumers
// depend on, so a stable object avoids needless churn.
let cached: RuntimeConfig | undefined

export function getRuntimeConfig(): RuntimeConfig {
  cached ??= resolve()
  return cached
}

// Test-only: drop the memoized singleton so a test can vary window config.
export function resetRuntimeConfigForTest(): void {
  cached = undefined
}

export function useRuntimeConfig(): RuntimeConfig {
  return getRuntimeConfig()
}
