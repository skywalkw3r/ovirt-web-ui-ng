# Implementation Plan — VM/Host/Cluster Metrics, Two Rungs, DWH-Optional

> Status: proposed (2026-07-06); **superseded in part (2026-07-12)** — rung 1
> shipped as planned, but rung 2's iframe embed was built, then replaced by
> the "rung 3" native path this plan deferred: history charts now query the
> DWH via Grafana's `/api/ds/query` (`api/grafana-query.ts`) with no iframes
> and no `frame-src` CSP directive, auto-enabled by the health probe, with a
> sign-in call-to-action covering the SSO-cookie seam (§5.5). This document
> stays as design history; the code and `config.js` are authoritative.
>
> Scoped against the live `app/` tree and
> `legacy/` wire quirks; grounded via a parallel-research + adversarial-verify
> pass (verdict: solid, no high-severity issues; three corrections folded in —
> see §11). Lab-gated unknowns are called out inline and in §9.

## 1. Summary & scope

Two independently-shippable rungs, both grounded in existing code and both
degrading gracefully when the Data Warehouse (DWH)/Grafana is absent.

**Rung 1 — extend the LIVE statistics plane** (session-local, no history, no
new deps, no new security surface).

- Add per-VM **disk** and **network** gauges to the existing `useVmStatistics`
  sampler and surface them, plus CPU/memory, in a new **Monitoring tab** on the
  VM detail page (reusing `GeneralTab`'s `UtilizationRow`/Victory sparkline
  pattern, extracted into a shared component so the two tabs don't diverge).
- Add **per-cluster CPU/memory aggregation** in `lib/utilization.ts` (group the
  already-fetched `['hosts','statistics']` hosts by `host.cluster.id`) and
  surface it on the Dashboard utilization card. This closes the "deferred
  VM-aggregation pass" comment at `utilization.ts:145-150`.
- Add a **single-entity host statistics** resource + hook so a
  `HostMonitoringTab` (and later cluster) has real data — none exists today; the
  schema is VM-shaped and reusable.

**Rung 2 — embed same-origin `ovirt-engine-grafana` panels** (`d-solo` iframes)
for real DWH **history**.

- A `MonitoringTab`-hosted `<GrafanaPanel>` renders per-entity `d-solo` iframes,
  templated by the oVirt entity GUID (`var-vm_id` / `var-host_id` /
  `var-cluster_id` / `var-datacenter_id`), theme-synced to `useTheme()`.
- Admin-gated (`useCapabilities`) **and** feature-flagged via a new
  runtime-config seam, **and** guarded by a layered DWH/Grafana availability
  detector.
- One synchronized CSP edit adds `frame-src 'self'` to all four authoritative
  locations.

**Explicitly deferred to rung 3 (named, not built):**

- Calling Grafana's `/api/ds/query` directly to render **native PF6 charts**
  from DWH data (fragile: cookie-only auth, POST, datasource UID, anti-CSRF).
  Iframe embedding is the v1 answer.
- Roaming the monitoring feature flag through the engine per-user options API —
  `grafanaBaseUrl` is a deployment fact, not a user pref, and stays out of that
  path permanently.
- Cross-origin Grafana embedding (would require a CSP host allowlist + security
  review). Same-origin only.
- Historical persistence of the live-plane sparklines (there is no engine
  history endpoint — that IS what rung 2 provides).

---

## 2. Config & feature model

**Reality of the repo (do not invent):** everything is **build-time only**
today. `vite.config.ts` uses the default `loadEnv`/`import.meta.env` pipeline
with no `define`, no `envPrefix`, no runtime plugin. `import.meta.env` is only
read for `BASE_URL`/`DEV`/`VITE_MOCK`/`VITE_MOCK_SCALE`. There is no `config.js`,
no `<meta>` config tag, no `window.__CONFIG__`. The only deployer→page injection
channel that exists is `window.userInfo` (SSO bootstrap), declared ambiently in
`global.d.ts` and validated with zod in `auth/bootstrap.ts`. So a no-rebuild
runtime config seam must be **added**, patterned exactly on that existing global.

### New runtime-config seam (NEW `app/src/config/runtime.ts`)

```ts
export interface RuntimeConfig {
  monitoring: {
    // same-origin path or absolute http(s) URL; default '/ovirt-engine-grafana'
    grafanaBaseUrl: string
    // deployer master switch; default false (opt-in) — see §3 rationale
    enabled: boolean
  }
}
export function getRuntimeConfig(): RuntimeConfig   // memoized module singleton
export function useRuntimeConfig(): RuntimeConfig   // thin hook wrapper
```

Source priority, mirroring `bootstrap.readInjectedSession()`:

1. `window.ovirtWebUiConfig` (deployer-injected global), zod `safeParse` at the
   boundary.
2. Build-time default via a new `define` in `vite.config.ts`
   (`__GRAFANA_DEFAULT__`), matching the anticipated `__APP_VERSION__` pattern.
3. Hard fallback `{ grafanaBaseUrl: '/ovirt-engine-grafana', enabled: false }`.

**Validation is load-bearing** (crosses a trust boundary → rendered into
`src`/`href`): reject anything that isn't an absolute `http(s):` URL **or** a
leading-slash same-origin path; drop `javascript:` etc. Same convention as the
LoginPage redirect validation and `bootstrap.ts` safeParse.

### Ambient type (`app/src/global.d.ts`, edit)

Extend `interface Window` alongside `userInfo?`:

```ts
ovirtWebUiConfig?: {
  monitoring?: { grafanaBaseUrl?: string; enabled?: boolean }
}
```

Keep permissive (all optional; scalars may be strings) — narrow in
`config/runtime.ts`.

### Flag/setting names (following THIS repo's conventions)

- Deployer config lives in `config/runtime.ts` under a `monitoring` block:
  **`monitoring.grafanaBaseUrl`**, **`monitoring.enabled`**. A nestable block
  (not a flat field) so future per-deployment flags extend it.
- **NOT** in `useSettings()` — that is per-user browser prefs (localStorage
  `console-settings`); a deployer URL there would let a user override deployment
  config. Explicitly excluded.
- Build-time env override: `VITE_GRAFANA_BASE_URL` (baked into
  `__GRAFANA_DEFAULT__`), documented as "rebuild required — use `config.js` for
  no-rebuild."

### How a deployer disables it

Three layers, any one hides the feature (feature renders **nothing** when off —
the repo's idiomatic "hide, don't disable" convention, matching
`visibleNavGroups` stripping `adminOnly` entries):

1. **`monitoring.enabled = false`** in `config.js` (default) → tab/section
   absent. Master kill switch.
2. Not admin → absent (existing `{isAdmin && …}` gate stays).
3. DWH/Grafana probe fails → absent or shows the "unavailable" state (§3).

### No-rebuild delivery

- **RPM/Apache path:** ship `config.js` as a real, non-content-hashed file that
  assigns `window.ovirtWebUiConfig`, referenced from `index.html` via
  `<script src="./config.js"></script>` **before** the module script
  (`script-src 'self'` already allows it). It **must** be excluded from the
  immutable-forever cache rule in `packaging/ovirt-web-ui-ng.conf` (add a
  `FilesMatch "^config\.js$"` no-cache exception copying the existing
  `index.html` one). Mark it `%config(noreplace)` in the spec so upgrades don't
  clobber a deployer's edit.
- **Container/nginx path:** generate `config.js` at container **start** via the
  existing `envsubst` template mechanism (`Containerfile` `NGINX_ENVSUBST_FILTER`),
  extended with `GRAFANA_BASE_URL`/`MONITORING_ENABLED` — same precedent as
  `ENGINE_ORIGIN`.

---

## 3. DWH/Grafana availability detection & fallback

**What the SPA can actually detect** (same-origin, bearer-token, no backend of
our own):

- It **can** fetch `GET {grafanaBaseUrl}/api/health` — unauthenticated, returns
  `200 {commit,database,version}`. Same-origin, so `connect-src 'self'` **already
  permits it (no CSP change for the probe)**. A `404` cleanly means "package
  absent" (no Apache `<Location>`); `502/503` means "installed but stopped";
  network error / non-JSON → unavailable. Treat **any non-2xx as unavailable**.
- It **cannot** detect `allow_embedding=false` (Grafana's default). An
  `X-Frame-Options: deny` block is **opaque** to JS — no readable error,
  `onload` still fires. So the probe proves *presence/liveness*, not
  *embeddability*.
- `health.database:'ok'` reflects Grafana's **own sqlite**, not the DWH Postgres
  datasource — Grafana can be healthy while panels show "No data."

### Layered detection strategy

- **Layer 0 — config flag (authoritative off-switch).** `monitoring.enabled ===
  false` → feature absent, no probe fired. Cheapest, deployer-controlled.
- **Layer 1 — capability gate.** `useCapabilities().isAdmin` (gate on `loaded &&
  isAdmin` to avoid flicker, as `*PermissionsTab` do). Non-admins never see it.
- **Layer 2 — runtime probe (NEW `app/src/hooks/useGrafanaAvailability.ts`).**
  TanStack Query `GET {grafanaBaseUrl}/api/health`, `enabled: monitoring.enabled
  && isAdmin`, short `staleTime`, poll floor `Math.max(refreshIntervalMs,
  ADMIN_RESOURCE_POLL_INTERVAL_MS)` (60s admin cadence). Returns `{ status:
  'checking' | 'available' | 'unavailable', refetch }`.
- **Layer 3 — graceful in-frame fallback.** Because embeddability is
  undetectable, the panel component also renders the "unavailable" state as its
  **manual escape hatch**: the user always gets an "Open in Grafana" new-tab
  link even when the iframe silently fails to paint.

### Exact UI states (four-states + a distinct "not configured / unavailable")

| State | Condition | Render |
|---|---|---|
| **Loading / checking** | probe `isPending` | `Skeleton` block (as `NicsTab` loading) |
| **Populated** | probe `available` | Rung-1 live charts (always) **+** rung-2 `<GrafanaPanel>` iframes below |
| **Not configured / unavailable** | `!monitoring.enabled` **or** probe `unavailable`/`isError` | `EmptyState` (info variant, NOT danger): title **"Monitoring history unavailable"**, body explaining DWH/Grafana isn't reachable, primary action = **"Open Monitoring Portal"** anchor `href={grafanaBaseUrl}` `target="_blank" rel="noopener"`, secondary "Retry" → `probe.refetch()`. **Rung-1 live charts still render above this** — the live plane never depends on DWH. |
| **Error (probe transport)** | probe `isError` | folded into "unavailable" above (info, with Retry) — a failed health probe is expected on DWH-less deployments, so it is NOT a red banner. |

Because `monitoring.enabled` defaults **false** and non-admins are gated, a stock
DWH-less engine shows the Monitoring **tab absent entirely** rather than a dead
panel. A deployer who enables it but hasn't set `allow_embedding=true` gets the
"unavailable/portal-link" state as the safety net for the undetectable X-Frame
block.

---

## 4. Rung 1 — live-plane extensions

### 4.1 New per-VM gauges (schema + sampler)

**`app/src/api/schemas/statistic.ts`** — two distinct wire paths:

- **Numeric gauges** need **no change** (`datum: z.coerce.number()` already
  parses string datums). `network.current.total` is a plain percent → free.
- **`disks.usage` is a JSON *string*, delivered on `values.value[n].detail`, NOT
  `.datum`** (legacy `transform.js:387-392`). The current schema only declares
  `datum`, so this gauge is **silently dropped** today, not NaN'd. Fix: add
  `detail: z.string().optional()` to the value object — **do not** coerce it to
  number. Then parse it in the sampler (see below), not in the schema.

**`app/src/hooks/useVmStatistics.ts`** — extend `UtilizationSample` and the
sampler `useEffect`:

```ts
export interface UtilizationSample {
  time: number
  cpu?: number
  memory?: number
  network?: number   // gaugePercent(data, 'network.current.total')
  disk?: number      // JSON.parse(values.value[0].detail) → sum used/total → %
}
```

Disk parse mirrors legacy `transform.js:392-399`: read `disks.usage` from
`.detail`, `JSON.parse` the `[{total,used},…]` array, sum, compute used/total %.
Scope open-question (§9 lab check): if a clean numeric per-VM **disk I/O rate**
gauge exists, prefer it over `disks.usage` capacity and skip the `.detail` parse.
`MAX_UTILIZATION_SAMPLES = 30` window unchanged. Query key
`['vm',vmId,'statistics']` unchanged → `GeneralTab.ComputeCard` and the new tab
**dedupe the fetch** (independent sample arrays — acceptable).

### 4.2 Per-cluster CPU/memory aggregation

**`app/src/lib/utilization.ts`** — the data is already present: `Host` carries
`cluster:{id?,name?}` **and** inline `statistics`. Add:

```ts
export function aggregateCpuByCluster(hosts: Host[]): Map<string, CpuSummary>
export function aggregateMemoryByCluster(hosts: Host[]): Map<string, CapacitySummary>
```

Both group hosts by `host.cluster?.id` then reuse the existing
`aggregateCpu`/`aggregateMemory` per group. **Aggregate from HOSTS, not VMs** —
`cpu.current.guest` (VM) and `cpu.current.user/system` (host) have different
denominators; summing VM guest% into a cluster figure is wrong. Host-based like
the existing dashboard donuts (low-risk parity); inherits the `isAdmin` gate +
30s floor of `['hosts','statistics']`.

> **Edit target (verifier fix):** update **only** the deferred-pass sentence at
> `utilization.ts:145-150` ("CPU and memory have no equivalent engine field and
> are deliberately left for a later VM-aggregation pass."). **Do NOT** touch
> `aggregateStorageVirtual` at `151-170` — it is live code, not the comment.

**`app/src/hooks/useDashboard.ts`** — extend `DashboardUtilization` with
`perCluster: { clusterId, name, cpu?, memory? }[]` derived in
`useDashboardUtilization` from the same `hosts.data` (no new query, no new engine
load). Optional per-cluster trend windows reuse the existing `useTrend` helper.

### 4.3 New single-entity host statistics (for HostMonitoringTab data)

There is **no** `fetchHostStatistics` today (`hosts.ts` only inlines via LIST
`follow=statistics`). Add, mirroring `fetchVmStatistics`:

- **`app/src/api/resources/hosts.ts`**: `fetchHostStatistics(hostId):
  Promise<VmStat[]>` → `GET /hosts/{id}/statistics`, parsed via the reusable
  `VmStatListSchema`.
- **`app/src/hooks/useHostStatistics.ts`** (NEW): mirror `useVmStatistics` but
  poll floor `Math.max(refreshIntervalMs, HOST_POLL_INTERVAL_MS)` (30s infra
  cadence), sample CPU (`cpu.current.user+system` / `100-idle`), memory
  (`memory.used`/`memory.total`), and NIC data gauges.

### 4.4 The per-entity Monitoring/Charts UI

**Extract the shared metric row (NEW `app/src/components/metrics/UtilizationRow.tsx`).**
Move `GeneralTab`'s `UtilizationRow` + collecting/unavailable/em-dash logic
(lines 220-283) into a shared component; widen `metric` from `'cpu'|'memory'` to
include `'network'|'disk'`. `GeneralTab.ComputeCard` imports it (its two rows
unchanged); the new `MonitoringTab` reuses it for all four.

**NEW `app/src/components/vm-tabs/MonitoringTab.tsx`** — signature `export
function MonitoringTab({ vm }: { vm: Vm })`, matching `GeneralTab`. Drives live
charts from `useVmStatistics(vm.id)`; four `UtilizationRow`s (CPU/mem/net/disk);
below them, the rung-2 Grafana section (§5) gated on flag+capability+probe.

**Chart rendering** — reuse the existing `@patternfly/react-charts/victory`
pattern verbatim: `ChartArea` in a zero-padding `ChartGroup`, `minDomain={{y:0}}
maxDomain={{y:100}}`, `interpolation="monotoneX"`, colors from `chart_color_*.var`
tokens, `<2` points → "collecting…" placeholder. Pin Victory text fills to PF CSS
vars (Victory ignores the dark theme). **No new chart library.**

**Polling cadence (CLAUDE.md):** VM tab → `useVmStatistics` at `refreshIntervalMs`
(10s, follows setting exactly). Host tab → 30s floor. Cluster/dashboard →
existing 30s host floor. `unmountOnExit` on the Tabs stops polling when hidden
(load-bearing — see risks).

---

## 5. Rung 2 — Grafana embed

### 5.1 `d-solo` URL builder (NEW `app/src/api/grafana.ts`)

```ts
export interface PanelSpec { uid: string; slug: string; panelId: number }
export interface GrafanaPanelArgs {
  panel: PanelSpec
  vars: Record<string, string>   // { vm_id | host_id | cluster_id | datacenter_id: <oVirt GUID> }
  from?: string                  // default 'now-6h'
  to?: string                    // default 'now'
  theme: 'light' | 'dark'
}
export function buildPanelUrl(base: string, a: GrafanaPanelArgs): string
// -> `${base}/d-solo/${uid}/${slug}?orgId=1&panelId=${panelId}&var-<k>=<v>…&from=…&to=…&theme=…`
```

`base` = `getRuntimeConfig().monitoring.grafanaBaseUrl`. The oVirt GUID the SPA
already holds maps **1:1** to the template var (`var-vm_id` resolves off `CAST(vm_id
AS varchar)` — no lookup). Dashboard **UIDs/slugs/panelIds** live in a small
in-repo table (`grafana.ts` constant) and are **verified in-lab** (§9) — likely
UIDs from the shipped JSON: `VirtualMachineDashboard`/`VMsTrendDashboard`
(`var-vm_id`), `HostDashboard`/`HostsTrendDashboard` (`var-host_id`),
`ClusterDashboard` (`var-datacenter_id,var-cluster_id`), `DatacenterDashboard`
(`var-datacenter_id`).

### 5.2 `<GrafanaPanel>` component contract (NEW `app/src/components/metrics/GrafanaPanel.tsx`)

```ts
export function GrafanaPanel(props: {
  panel: PanelSpec
  vars: Record<string, string>
  title: string
  from?: string; to?: string
}): JSX.Element
```

- Reads `useTheme()` → `theme`, appends `&theme=${theme}`, and **keys the
  `<iframe>` on `theme`** to force a reload on toggle (no cross-doc postMessage).
- Reads `useRuntimeConfig()` for `grafanaBaseUrl`; builds `src` via
  `buildPanelUrl`.
- `<iframe title={title} loading="lazy">` with fixed height; wrapped in a PF
  `Card`. Same-origin is required for the `grafana_session` cookie to ride the
  request — do not strip `allow-same-origin` if a sandbox is used.
- Because an X-Frame block is opaque, the parent Monitoring section always
  renders the §3 "Open in Grafana" fallback link beside/below the panels.

### 5.3 Slotting into detail tabs

- **VM (rung-2 primary):** `MonitoringTab` renders `<GrafanaPanel vars={{ vm_id:
  vm.id }} …/>` sections below the rung-1 live charts, inside the
  flag+capability+probe gate. Insert into `VmDetailsPage.tsx`: top-of-file import
  + a new `<Tab eventKey="monitoring" title={<TabTitleText>Monitoring</TabTitleText>}>
  <TabContentBody hasPadding><MonitoringTab vm={vm.data} /></TabContentBody></Tab>`
  right after the General tab (~line 170). No `<Tabs>` prop change (inherits
  `unmountOnExit`). `eventKey="monitoring"` doesn't collide with any `MORE_TABS`
  key.
- **Host / cluster follow-on:** identical insertion in `HostDetailPage.tsx`
  (after `HostGeneralTab`, ~line 318) and `ClusterDetailPage.tsx` (after
  `ClusterGeneralTab`, ~line 192) with new `HostMonitoringTab` (`vars={{host_id}}`)
  / `ClusterMonitoringTab`. Host needs the §4.3 host-stats resource+hook first
  for its live charts.

  > **Cluster datacenter var (verifier fix):** `ClusterDashboard` templates on
  > **both** `var-cluster_id` **and** `var-datacenter_id`. The cluster GUID is on
  > hand, but the datacenter GUID is only present if `getCluster` followed it —
  > `ClusterSchema` carries `data_center` as an optional linked entity populated
  > by `?follow=data_center`. Confirm `ClusterDetailPage`'s `getCluster` uses
  > that follow and thread `cluster.data_center.id` into `vars`; if absent, add
  > the follow, else the panel renders "No data."

### 5.4 Capability + flag gating

Rung-2 section renders only when `monitoring.enabled && loaded && isAdmin &&
probe.available`. The existing AppShell portal anchor (both call sites ~
`AppShell.tsx:221-228` and `:285-298`) stays as the always-available new-tab
escape hatch; optionally its `{isAdmin && …}` becomes `{isAdmin &&
monitoring.enabled && …}` and its `href` is sourced from `grafanaBaseUrl` (both
call sites change together — single-owner file).

### 5.5 SSO-cookie seam handling

The SPA's in-memory bearer token is **not** readable by the iframe. Grafana uses
its own `grafana_session` cookie (same-origin, `SameSite=Lax` → sent on the
same-site iframe request). With `[auth.anonymous]=false` /
`oauth_auto_login=false`, a **first-ever** visit inside the frame lands on the
Grafana login page, and the Keycloak SSO redirect may itself be frame-blocked.
**Mitigation:** on probe-available but iframe-empty, the "Open Monitoring Portal"
link lets the user establish `grafana_session` top-level once; subsequent embeds
load directly. Document this as the deployer/first-run note; verify end-to-end
in-lab (§9). Do **not** attempt token hand-off.

---

## 6. CSP change (four locations, kept in sync)

Same-origin makes `frame-src 'self'` sufficient: `/ovirt-engine-grafana` resolves
on the page origin (Apache/nginx proxy). No host allowlist. `frame-ancestors`
(who may frame US) is unrelated and stays `'none'` **in the header only**.
`connect-src 'self'` already covers the `/api/health` probe — **no connect-src
change**.

Add `frame-src 'self'` (right before `base-uri 'self'`, keeping directive order)
to:

1. **`app/index.html`** meta `content` (meta form = header **minus**
   `frame-ancestors`): `…script-src 'self'; frame-src 'self'; base-uri 'self';
   object-src 'none'`. Also update the CSP comment block.
2. **`docs/SECURITY-HEADERS.md`** authoritative header string (keep
   `frame-ancestors 'none'`), add a `frame-src` table row, and **rewrite** the
   "No `frame-src`" note to say a scoped `frame-src 'self'` is now present for the
   same-origin Grafana embed.
3. **`packaging/ovirt-web-ui-ng.conf`** Apache `Header always set
   Content-Security-Policy` string.
4. **`packaging/nginx-sample.conf`** nginx `add_header Content-Security-Policy …
   always` string.

Meta must **not** gain `frame-ancestors`; the three header locations must keep
it. A CSP-sync unit test (§9) guards drift.

---

## 7. i18n strings (new ids in `app/src/i18n/messages/en.ts`)

`nav.monitoringPortal` already exists. Add a `monitoring.*` namespace (English
only; the 10 locale catalogs are `Partial` and backfilled separately):

```ts
'monitoring.tab': 'Monitoring',
'monitoring.live.heading': 'Live utilization',
'monitoring.history.heading': 'History',
'monitoring.cpu': 'CPU',
'monitoring.memory': 'Memory',
'monitoring.network': 'Network',
'monitoring.disk': 'Disk',
'monitoring.unavailable.title': 'Monitoring history unavailable',
'monitoring.unavailable.body':
  'The Data Warehouse / Grafana dashboards are not reachable. Live utilization above still works; historical charts require the DWH to be installed and reachable.',
'monitoring.openPortal': 'Open Monitoring Portal',
'monitoring.retry': 'Retry',
'monitoring.collecting': 'collecting…',
'monitoring.notAvailable': 'not available',
```

Usage: `<FormattedMessage id="monitoring.tab" />` for the tab title and headings;
`t('monitoring.openPortal')` etc. from `useT()` for `aria-label`/`title`/EmptyState
props. Existing detail-tab titles are hardcoded English; per CLAUDE.md the new
strings **should** be i18n'd — a deliberate, documented divergence (call it out
in the PR). `coverage.test.ts` only fails on dead keys, so en-only additions
never break sync.

---

## 8. File-by-file change list (tagged, single-owner-respecting)

**NEW files**

| File | Rung | Purpose |
|---|---|---|
| `app/src/config/runtime.ts` | R2 | runtime-config reader, zod-validated |
| `app/src/api/grafana.ts` | R2 | `buildPanelUrl` + `PanelSpec` table (lab-verified UIDs) |
| `app/src/hooks/useGrafanaAvailability.ts` | R2 | `/api/health` probe hook |
| `app/src/components/metrics/UtilizationRow.tsx` | R1 | shared metric row (extracted) |
| `app/src/components/metrics/GrafanaPanel.tsx` | R2 | themed `d-solo` iframe + fallback |
| `app/src/components/vm-tabs/MonitoringTab.tsx` | R1+R2 | VM tab host |
| `app/src/hooks/useHostStatistics.ts` | R1 | single-host stats sampler |
| `app/src/components/host-tabs/HostMonitoringTab.tsx` | R1+R2 | follow-on |
| `app/src/components/cluster-tabs/ClusterMonitoringTab.tsx` | R1+R2 | follow-on |
| `app/public/config.js` (or packaging template) | R2 | default `window.ovirtWebUiConfig` |

**EDITS**

| File | Rung | Change |
|---|---|---|
| `app/src/global.d.ts` | R2 | add `ovirtWebUiConfig?` to `Window` |
| `app/vite.config.ts` | R2 | `define: { __GRAFANA_DEFAULT__ }` from `VITE_GRAFANA_BASE_URL` |
| `app/index.html` | R2 | `<script src="./config.js">` before module script; `frame-src 'self'`; comment update |
| `app/src/api/schemas/statistic.ts` | R1 | add uncoerced `detail: z.string().optional()` (string-datum gauges like `disks.usage`) |
| `app/src/hooks/useVmStatistics.ts` | R1 | extend `UtilizationSample` + sampler (network/disk) |
| `app/src/lib/utilization.ts` | R1 | `aggregate{Cpu,Memory}ByCluster`; edit only the `145-150` comment |
| `app/src/hooks/useDashboard.ts` | R1 | `perCluster` in `DashboardUtilization` |
| `app/src/pages/DashboardPage.tsx` | R1 | render per-cluster CPU/mem |
| `app/src/api/resources/hosts.ts` | R1 | `fetchHostStatistics` |
| `app/src/components/vm-tabs/GeneralTab.tsx` | R1 | import shared `UtilizationRow`, delete local copy |
| `app/src/pages/VmDetailsPage.tsx` | R1+R2 | import + `<Tab eventKey="monitoring">` |
| `app/src/pages/HostDetailPage.tsx` / `ClusterDetailPage.tsx` | R1+R2 | Monitoring tab insertion (cluster: ensure `follow=data_center`) |
| `app/src/components/AppShell.tsx` | R2 | (optional) source portal `href` from config, add `monitoring.enabled` to both gates |
| `app/src/i18n/messages/en.ts` | R1+R2 | `monitoring.*` ids |
| `app/src/api/mock/handlers.ts` | R1 | extend VM/host statistics with network/disk gauges; add mock `/api/health` + host `/statistics` |
| `docs/SECURITY-HEADERS.md` | R2 | `frame-src 'self'` + note rewrite |
| `packaging/ovirt-web-ui-ng.conf` | R2 | `frame-src`; `config.js` no-cache `FilesMatch` |
| `packaging/nginx-sample.conf` | R2 | `frame-src`; config.js envsubst |
| `packaging/Containerfile` + `packaging/ovirt-web-ui-ng.spec` | R2 | `config.js` envsubst filter; `%config(noreplace)` |

**Single-owner note:** `AppShell.tsx`, `VmDetailsPage.tsx`, `utilization.ts`,
`useDashboard.ts` each touched by one workstream per pass. Extract
`UtilizationRow` **before** `MonitoringTab` consumes it.

---

## 9. Test & verification plan

**Unit (vitest)**

- `app/src/lib/utilization.test.ts` — extend for
  `aggregate{Cpu,Memory}ByCluster`: grouping by `host.cluster.id`, hosts with
  missing cluster link, mixed reporting hosts, clamp bounds.
- `app/src/api/grafana.test.ts` (NEW) — `buildPanelUrl` var serialization,
  theme/from/to defaults, slug/uid/panelId placement.
- `app/src/config/runtime.test.ts` (NEW) — window-global parse, build-time
  fallback, hard fallback, and **URL validation** (reject `javascript:`, accept
  `/path` and `https://…`).
- `useVmStatistics` — network/disk sampling and `disks.usage` `.detail` JSON
  parse (string→array→%).
- **CSP-sync test** (NEW, e.g. `app/src/security-headers.test.ts`) — assert
  `index.html` meta == header-string-minus-`frame-ancestors`, and all three
  header configs carry `frame-src 'self'`.

**e2e / axe (Playwright, mock-backed)**

- VM detail → Monitoring tab: four live rows render, "collecting…" then sparkline
  after 2 polls, axe clean.
- Not-configured state: `monitoring.enabled=false` (or mock `/api/health` → 404)
  → assert EmptyState + "Open Monitoring Portal" link; axe clean. **This is the
  fallback path.**
- Available state: mock `/api/health` → 200 → assert Grafana section + iframe
  present (iframe content not asserted under mock).

**Mock-mode support (`VITE_MOCK`)**

- Extend `vmStatistics()` with `network.current.total` + a `disks.usage`
  JSON-string gauge (on `.detail`); host stats with NIC data gauges — keep
  string datums to exercise coercion.
- Add mock `GET /ovirt-engine-grafana/api/health` (togglable 200/404) and `GET
  /hosts/{id}/statistics`.

**LAB validation checklist (real engine)**

- Confirm the Grafana path is literally `/ovirt-engine-grafana` and
  `d-solo/<uid>/<throwaway-slug>?panelId=…` resolves.
- Record real **panelIds** per shipped dashboard JSON (CPU/mem/network/disk trend
  panels).
- Verify `GET /ovirt-engine-grafana/api/health` returns 200 unauthenticated
  through Apache, and 404 cleanly when the package is absent.
- **SSO-cookie seam:** after engine SPA login, is `grafana_session` already
  present, or must the user visit the portal once? Does Keycloak's
  `frame-ancestors`/`X-Frame-Options` block the SSO redirect **inside** the frame?
- Confirm `allow_embedding=true` is set (deployer step) — else iframe is blank
  with no JS-visible signal; the fallback link is the safety net.
- Verify template var names and the DWH view prefix (`v4_5_*`) match the deployed
  engine version.
- Confirm `theme=light|dark` renders and the iframe reloads on PF theme toggle.

---

## 10. Sequencing & effort

Each rung independently shippable; rung 1 ships with zero security/config/deps
change.

1. **R1a — shared row + VM live gauges.** Extract `UtilizationRow`; extend
   `useVmStatistics` + mock; build `MonitoringTab` (live-only, no Grafana
   section); insert VM tab. *Ships alone.* Low risk.
2. **R1b — per-cluster aggregation.** `utilization.ts` helpers + tests +
   `useDashboard`/`DashboardPage`. *Ships alone.* Low risk.
3. **R1c — host stats resource/hook + HostMonitoringTab** (+ cluster). *Ships
   alone.* Medium (new resource/schema surface).
4. **R2a — config seam.** `config/runtime.ts` + `global.d.ts` + `config.js` +
   packaging cache/envsubst/spec. *Ships alone.* Medium.
5. **R2b — CSP change (four locations) + sync test.** *Ships alone*,
   security-review-gated. Low code / high review.
6. **R2c — Grafana embed.** `grafana.ts` + `GrafanaPanel` +
   `useGrafanaAvailability` + wire into `MonitoringTab`; AppShell gate. Depends on
   R2a+R2b. Medium; **lab-blocked** on panelIds/embeddability/SSO seam.

**Risks**

- `unmountOnExit` is load-bearing — a MonitoringTab moved out of `<Tabs>` or into
  `MoreTabsMenu` must preserve conditional mounting or it polls while hidden.
- `allow_embedding=false` (Grafana default) and the opaque X-Frame block are the
  single hardest external dependency — the "unavailable/portal-link" fallback
  exists precisely because the SPA can't detect it.
- `disks.usage` is a JSON string on `.detail`, not a number on `.datum` — needs a
  dedicated parse path; confirm the exact disk gauge in-lab before committing.
- CSP four-location drift — the sync unit test is mandatory; the
  meta/`frame-ancestors` asymmetry is easy to get wrong.
- Host/cluster monitoring is **not** "same as VM" — it needs the §4.3
  resource+hook first.
- First-run SSO seam inside the iframe may force a top-level portal visit —
  verify in-lab, keep the link fallback regardless.

---

## 11. Adversarial-verify corrections applied

This plan was checked by a separate pass re-reading the code against the
contracts (four-states, capability gating, CSP sync, same-origin discipline,
detection soundness, i18n, single-owner). Verdict: **solid** (no high-severity
issues). Corrections folded in:

1. **(medium) Disk gauge wire path.** `disks.usage` arrives as a JSON string on
   `values.value[n].detail`, not `.datum` (legacy `transform.js:387-392`). The
   schema must add an **uncoerced** `detail` field and the sampler must
   `JSON.parse` it — §4.1 rewritten accordingly.
2. **(low) Comment edit target.** The deferred-pass comment is
   `utilization.ts:145-150` only; `151-170` is live `aggregateStorageVirtual`
   code that must not be deleted — §1/§4.2 corrected.
3. **(low) Cluster datacenter var.** `ClusterDashboard` needs `var-datacenter_id`;
   ensure `getCluster` uses `?follow=data_center` and thread
   `cluster.data_center.id` — §5.3 corrected.

**Lab-blocked unknowns (cannot be finalized from code alone):** exact disk metric
choice (rate gauge vs `disks.usage` capacity); Grafana panelIds/UIDs/slugs; and
the first-run SSO-cookie seam behaviour inside the frame. All three are covered
by the §9 lab checklist and the portal-link fallback.
