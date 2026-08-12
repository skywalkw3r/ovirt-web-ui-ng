# CLAUDE.md

Guidance for working in this repository. Deep dives live in
[docs/PLAN.md](docs/PLAN.md) (phased roadmap, navigation IA, security posture)
and [docs/COMPONENTS.md](docs/COMPONENTS.md) (PF6 component map, design ground
rules) — link to them, don't duplicate them.

## Repo map

- `app/` — the frontend: React 19, TypeScript strict, PatternFly 6,
  TanStack Query/Router, Vite. All work happens here.
  (The original ovirt-web-ui VM Portal once lived under `legacy/` as read-only
  reference; it was removed — for API quirks / SSO / console lineage consult
  upstream https://github.com/oVirt/ovirt-web-ui or this repo's git history.
  See the Acknowledgements section in README.md.)
- `lab/` — Ansible automation that builds a single-node oVirt 4.5 lab on
  Proxmox (nested-virt node + self-hosted engine). See `lab/ansible/README.md`.
- `docs/` — `PLAN.md`, `COMPONENTS.md`, and `LAB-SETUP.md` (the manual lab
  build the Ansible pipeline automates).

## App architecture (`app/src/`)

Data flows one way: **transport → schemas → resources → hooks → pages**.

- `api/transport.ts` — single fetch wrapper for `/ovirt-engine/api` (bearer
  token in memory + a per-tab sessionStorage mirror, `ApiError`). Auth/SSO
  lives in `api/auth.ts` + `auth/`.
- `servers/registry.ts` — multi-engine: the active engine base ('' =
  same-origin; else an https origin from config.js `servers.list`) prefixing
  every API/SSO call. Config-file-only list (no user-added servers); active
  pick persists in localStorage `console-active-server`, the session's engine
  binding in sessionStorage beside the token. **Build-gated to proxy/external
  deploys**: only `VITE_MULTI_ENGINE=1` builds (the Containerfile) honor the
  list — the integrated RPM build compiles the capability out and is always
  single-engine. Each engine is reached same-origin via a `/e/<slug>` proxy
  path (no CORS) or cross-origin via an https origin (per-engine CORS); CSP
  wiring in `docs/SECURITY-HEADERS.md` §Multi-engine.
- `api/schemas/` — zod schemas, one per entity. The live engine serializes
  numbers/booleans as JSON strings, so schemas must coerce both forms.
- `api/resources/` — one module per REST collection; typed functions that
  parse responses through the schemas.
- `hooks/` — TanStack Query hooks. All poll hooks read the user-tunable
  interval from `useSettings`; module constants are defaults. VM-centric
  queries default to 10s and follow the setting exactly on small installs;
  past ~500/~2000 VMs the full-collection payload floors the cadence at
  30s/60s (`vmPollIntervalMs` in `useVms`), and past the same ~500 the list
  read drops `follow=statistics` (`vmListFollow` — Uptime shows an em dash
  there; tags always ride). Catalog/infra collections (30s)
  and admin/parity collections (60s) treat their constant as a floor
  (`Math.max`) so slow inventory never polls at the VM cadence.
- `pages/` + `routes/router.tsx` — TanStack Router; `routes/Protected.tsx`
  gates authenticated routes and redirects to `/login`.
- **Mock mode** — `VITE_MOCK=1` (dev-only) short-circuits transport/auth into
  `api/mock/handlers.ts` via dynamic import; fixtures never reach production
  bundles. `VITE_MOCK_SCALE=<n>` appends n generated `vm-scale-N` VMs for
  load testing. Fixtures deliberately mix string/number scalar forms to
  exercise schema coercion.
- **RBAC tiers** — `auth/capabilities.ts` exposes `{ tier: 'user' | 'admin',
isAdmin, loaded }`. Admin-only nav entries and pages are hidden per tier;
  the engine's `Filter` header does the real enforcement server-side.
- **Providers** (nested in `main.tsx`) — `theme/ThemeProvider.tsx` owns the
  `pf-v6-theme-dark` class on `<html>` (dark default, localStorage
  `console-theme`); `settings/SettingsProvider.tsx` owns refresh interval and
  preferred console (localStorage `console-settings`; engine user-options
  roaming is the Phase-later path, patterned on the original ovirt-web-ui's
  `optionsManager` — see upstream).
- Toasts and the notification drawer live in `notifications/`.

## i18n

react-intl wraps the tree in `i18n/I18nProvider.tsx` (below `SettingsProvider`,
which owns the `locale` setting). 11 locales ship: `en` (source) + es, fr, de,
pt-BR, it, ru, zh-CN, ja, ko, tr — flat `id → string` catalogs in
`i18n/messages/<locale>.ts`, endonym labels in `i18n/locales.ts`.

- **Sync rule** — `en.ts` is required and exhaustive; it defines `MessageId`
  (`keyof typeof en`). The 10 translated catalogs are
  `Partial<Record<MessageId, string>>`; I18nProvider resolves
  `{ ...en, ...locale }`, so an untranslated id renders English instead of
  breaking. That fallback is a safety net, not a workflow: **every change
  that adds or edits interface text lands the matching entries in all 10
  locale catalogs in the same pass** — new `en.ts` ids ship with their
  translations, never as a deferred backfill. Reuse each locale's existing
  terminology (nav labels, entity names, pagination phrasing) when
  translating, and don't propagate an existing mistranslation you notice —
  fix or flag it. `src/i18n/coverage.test.ts` fails on dead keys (locale ids
  missing from en) and logs per-locale coverage %, which should stay at 100%.
- **Converting a string** — add the id to `en.ts` (namespaced: `nav.*`,
  `login.*`, `action.*`, `viewState.*`, …), then `<FormattedMessage id="…" />`
  for element text, or `t('…')` from `useT()` (`i18n/useT.ts`) for string
  props (`aria-label`, `title`, `placeholder`) and imperative strings — ids
  autocomplete and typos fail typecheck. Finish by adding the id's
  translation to each of the 10 locale catalogs (sync rule above). Reference
  slice: `components/AppShell.tsx`, `pages/LoginPage.tsx`.
- **ICU conventions** — interpolation `{principal}`; plurals
  `{count, plural, one {# VM} other {# VMs}}`, rendered via
  `t('vms.count', { count })`. Keep product/technical tokens (oVirt, vNIC,
  Keycloak SSO, aaa-jdbc, SPICE/VNC) and ICU placeholders verbatim in every
  locale.
- **New locale** — add `messages/<locale>.ts`, register it in
  `i18n/catalogs.ts` CATALOGS, `SUPPORTED_LOCALES` (settings/context.ts), and
  `LOCALE_LABELS` (`i18n/locales.ts`).

## Commands

Frontend (run from `app/`):

- `npm run dev` — Vite against a real engine (proxy in `vite.config.ts`)
- `npm run dev:mock` — Vite against the in-repo mock engine
- `npm test` — Vitest unit tests
- `npm run e2e` — Playwright (mock-backed; includes axe a11y checks)
- `npm run lint` — oxlint + `prettier --check`; fix with `npm run format`
- `npm run typecheck` / `npm run build`

Lab: `cd lab/ansible && ansible-playbook site.yml` (Proxmox credentials and
inventory prerequisites in `lab/ansible/README.md`).

## Conventions

- **Four states, always.** Every data view designs loading (`Skeleton`),
  error (`EmptyState` + retry), empty (`EmptyState` + call-to-action), and
  populated. No blank screens, no raw spinners.
- **Zod coercion** for engine scalars — never assume a number arrives as one.
- **Destructive actions** confirm via `ConfirmModal` (danger variant;
  typed-name confirm for VM delete).
- **Accessibility**: aria-labels on icon-only buttons, tables, and inputs —
  the e2e suite runs axe against every page.
- **No deprecated PF components** (`Chip` → `Label`, `Tile` → `Card`); no
  beta PF components without explicit sign-off; PF tokens only, no hardcoded
  colors (brand overrides live in `app/src/styles/brand-tokens.css`).
- **Style**: Prettier-enforced — no semicolons, single quotes, 100 columns.
  Run `npx prettier --write` on anything you touch; keep oxlint clean.

## Workflow patterns

- **Feature contracts** — multi-agent work is split by explicit contracts
  naming the exported APIs, defaults, and storage keys each stage must honor.
- **Single owner per shared file** — two workstreams never edit the same file
  in one pass; extend a neighbor's API only through its contract.
- **Adversarial verify** — a separate pass re-reads the contracts and hunts
  for violations (types, defaults, a11y, four-states) before anything merges.
- **Report failure ≠ work failure** — subagents sometimes complete their file
  work but fail the structured-report step (or return junk like "test").
  Always verify by direct diff/tests before re-running a job.
- **The i18n catalogs have exactly one owner per pass.** Other workstreams
  reference pre-seeded ids or hardcode English and hand the wanted ids off.
  Whoever owns `en.ts` in a pass owns all 11 catalogs and lands the 10
  locale translations for every id they add (sync rule) — locale files are
  never left for a later backfill pass.

## UI rules (established, do not regress)

- **Single-line cells, everywhere.** A global rule in `brand-tokens.css`
  makes every table cell nowrap+ellipsis (48ch cap; action cells exempt).
  Long free-text columns additionally use `modifier="truncate"` with a
  `title` carrying the full value. Never reintroduce wrapping rows.
- **Row actions live in the kebab.** List rows carry exactly one kebab; no
  standalone per-row buttons. Detail-page headers keep at most
  Edit / Power / Console — everything else goes in the kebab.
- **Any list with >4 columns** uses the `COLUMNS` array +
  `useColumnPrefs(area, columns)` + `ColumnPicker` pattern (Name pinned
  `always: true`; headers and cells map over the same filtered array).
  Headers render through `ResizableTh` (drag/keyboard-resizable widths,
  persisted per area alongside visibility; Reset clears both), the `<Table>`
  spreads `resizableTableProps(prefs)` and sits in a `.app-table-viewport`
  wrapper so an over-wide grid scrolls in place.
- **Attribute filtering is faceted, never per-column.** A list narrows by
  facet dropdowns in its `PaneToolbar` (`filters` slot — they target one
  table, so they ride tier 2 under the pane's identity banner, not the page
  toolbar): declare a `FacetDef` catalog next to the column catalog
  (`vmListFacets.ts`), drive it with `lib/facets.ts` + `useFacetFilters`
  (state lives in the `filters` URL param, so a filtered view is a shareable
  link) and render `FacetFilters` into that slot. Facet values are stable
  keys (entity ids, engine enums), never display names;
  OR within a facet, AND across facets; option lists come from the rows in
  scope, counts from the rows matching every OTHER facet, and a zero-count
  option is disabled rather than dropped so the toolbar never reshuffles
  mid-click. A checkbox `Select` needs `role="menu"` (PF's default
  `listbox` + `hasCheckbox` rows is an invalid ARIA pairing). Only facet on
  attributes EVERY row can answer — a facet most rows hold no value for
  (Host: running VMs only) silently empties the table and belongs on the
  owning entity's detail tab instead.
- **Empty-state CTAs** are wrapped in `EmptyStateFooter > EmptyStateActions`
  (a bare Button child renders flush against the body text; a global CSS
  shim covers legacy instances but new code uses the wrapper).
- **Toasts** render top-center below the masthead, auto-dismiss 5s, via the
  notifications context only. Toast strings are hardcoded English.
- **Field help**: non-obvious form fields get a `FieldHelp` popover
  (`components/forms/FieldHelp`); skip Name/Description/Comment.
- **The two inventory trees are one surface**: icon-only
  `InventoryViewSwitcher` above each tree; flat Templates/Hosts/Clusters
  pages stay routable but out of the nav. New list-page features land on
  the inventory views first — that is where users live.
- **PF element-set overrides** need the `:root .pf-v6-c-*` selector prefix
  to win regardless of import order; traps are documented inline in
  `brand-tokens.css`. Compact spacing (button padding, toolbar gaps) is set
  there — don't re-widen per component.

## Live-engine REST hygiene (hard-won; violations = HTTP 500 in prod)

- **Never `follow=` user/group principals on permissions reads** — live
  directory-backed engines NPE (HTTP 500). `follow=role` is proven safe;
  principal names join client-side against the cached user/group lists
  (`PermissionsPanel` already does this).
- **Followed collection reads degrade, never fail**: on a 5xx, a client
  timeout (which a WAN engine hits on large followed reads), or a plain 400
  (some engine builds reject follow terms outright — live-verified) from a
  `?follow=` read, retry bare and render without the inlined extras. The
  shared helper is `fetchWithFollowFallback` (`api/followDegrade.ts`) — use
  it for every new followed read; multi-rung ladders (getVm, listHostsUsage)
  share its `isDegradableFollowError` predicate. Denial memory is
  engine-scoped automatically. Deployers can mark a high-latency engine
  `wan: true` in config.js `servers.list` — `isActiveEngineWan()` — and
  heavy shapes (VM `follow=statistics`, the hosts `nics.statistics` rung)
  must not be probed there at all.
- **404 on an optional subcollection means empty**, not error.
- **Static catalog fallback**: when the engine returns 200+empty for a
  catalog webadmin compiles statically (e.g. the permit catalog =
  SuperUser's permits), fall back to a source-verified static list and
  `console.warn` the degradation (`PERMIT_CATALOG_FALLBACK` precedent).
- **Every endpoint is verified against ovirt-engine-api-model before
  wiring** (and webadmin UiCommon models for dialog field sets); deliberate
  divergences are documented in a code comment.
- **Every new endpoint gets a mock route + fixture** (scalars mixed
  string/number per the coercion convention). When intentional fixture
  growth breaks count-pinned tests, update the tests to track the fixture
  and say so in a comment — prefer containment/shape assertions over
  count pins in new tests.
