# Modernization Plan — oVirt VM Management Frontend

Clean-break rebuild in `app/`, with `legacy/` as the reference implementation.
Target: secure, fast, modern VM-management UI against the oVirt 4.5 REST API.

## Principles

1. **API-first, backend untouched.** Everything goes through
   `/ovirt-engine/api` (+ `/sso` for auth, websocket-proxy for consoles).
   No engine patches required to run the new UI.
2. **Legacy is read-only.** We mine it for knowledge (API quirks, SSO, console
   launching, feature inventory) but never import its code. When a legacy file
   has taught us what it knows, it owes us nothing further.
3. **Ship a walking skeleton early.** Login + VM list against the lab engine
   by end of Phase 1; every later phase keeps the app deployable.
4. **Security is a phase AND a habit.** Phase 4 is the audit; the rules
   (tokens in memory, strict CSP from day one, no `dangerouslySetInnerHTML`,
   pinned deps + scanning in CI) start in Phase 1.

## Scope — which oVirt portals does this replace?

**This rebuild replaces BOTH the VM Portal (`legacy/`) AND the GWT Admin
Portal (webadmin).** *(Decision 2026-07-04 — expanded from the original
"VM Portal only" scope; see `MEMORY.md` → scope-webadmin-replacement.)*

- **Phases 1–5** deliver the unified read/monitor + VM-lifecycle core for both
  regular users and admins: VM lifecycle, consoles, snapshots, disks, NICs,
  migration, folders/tags, dashboard, and webadmin-parity **detail pages** for
  every entity (VM, host, template, network, disk, data center, cluster). The
  `Filter` header + capability model serve both audiences in one app.
- **Phase 6 — full Admin Portal replacement** *(the mission now)*: grow the
  app to cover webadmin's whole surface so the GWT portal can be retired. This
  is the CRUD/config 80% beyond read/monitor —
  - **Create/edit/delete** for hosts, storage domains, logical networks,
    clusters, data centers, templates, vNIC profiles, pools.
  - **Infrastructure config**: host NIC/network setup, storage provisioning
    (iSCSI/FC/NFS/LUN), scheduling & affinity policy editing, MAC pools,
    instance types, quotas config.
  - **Governance**: users/roles/permissions management, tags/bookmarks,
    external providers/Foreman, gluster.
  Build strictly by value; land each capability behind the existing RBAC tier.
- **Out of scope for now (deferred, not abandoned):** **DWH-backed analytics**
  — historical trends, heatmaps, and the exact committed/allocated the webadmin
  dashboard computes from the data warehouse. We approximate what the live REST
  API gives for free (e.g. storage committed/allocated from `StorageDomain`
  fields) and defer the rest until the DWH integration is scoped.
- This is a multi-person-year program; webadmin keeps running unchanged
  alongside the app until parity lands (same engine, same API, zero migration
  risk), so the cutover is incremental and reversible.

## Status snapshot *(updated 2026-07-05)*

- **Phases 0–3: done.** Lifecycle, wizard (template-optional), edit modal
  (left-rail sections), folders/tags with drag-and-drop, noVNC console (opens
  in a new tab via an origin-checked postMessage handshake), disks, snapshots
  **including preview/commit/undo**, NICs, RBAC tiers + `Filter` scoping.
- **Phase 4: first pass done** — threat model, security review, CSP posture,
  token-in-memory auth. Outstanding: RPM/same-origin packaging, perf budget
  run at 500-VM scale, CI audit gating.
- **Phase 5: largely done** — dashboard (3/5/4 grid, utilization donuts,
  activity feed), Events page, search DSL + bookmarks + pagination + column
  pickers on every list, grouped notification drawer (sticky severity=alert
  query) + Tasks drawer, statuses/status colors, settings (refresh interval,
  preferred console, theme, locale). Outstanding: i18n rollout
  ([I18N-PLAN.md](I18N-PLAN.md)), full a11y audit pass, beta release
  (fork/push pending `gh auth login`).
- **Phase 6 (the mission): read parity complete, write parity deep.** Detail
  pages for all 8 entities; create/edit/delete shipped for VM, template
  (+Make Template), host (maintenance-gated remove), cluster, data center,
  network, NFS storage domain (create+attach); Clone VM; snapshot disk
  selection; webadmin-depth options on all five newest modals (clone trimmed
  to the REST contract, template sub-versions/disk allocation/seal, SD
  connection+advanced params, host PM/SPM/console/kernel) — each reviewed
  against the GWT UiCommon models; **New Host add/install wizard** (recon'd
  against HostModel + the REST mapper; installing→up flow, e2e-covered).
  i18n Phase 0 (en-base fallback + Partial locales) unblocked the string
  rollout. Next up: host network setup (setupnetworks), permissions
  management UI, iSCSI/FC domain create, quotas/MAC pools/instance types,
  OVA export, **disk upload + the disks page's missing webadmin features**
  (image upload/download with the imageio flow, move/copy disk, sparsify —
  mine the GWT DisksView/UploadImagePopup source for the full inventory),
  and **page-depth review passes for Users/Providers, vNIC Profiles,
  Networks, and Quota pages** (columns, actions, and dialogs vs their
  webadmin counterparts). **vCenter-style inventory trees: shipped
  2026-07-05** — folder parity (rename/re-parent, counts, deep links, bulk
  move, read-only user tier) plus the dual navigation: **VMs & Templates**
  (`/vms-templates`, both kinds under the one tag-backed folder tree) and
  **Hosts & Clusters** (`/hosts-clusters`, structural DC → cluster → host
  scoping a VM table). See §2.5 for the parity details.
- Scale: ~240 local commits, 458 unit tests + 40 e2e (axe on every page), all
  green; verified against the hosted-engine lab throughout.

## Target stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 19 + TypeScript (strict) | Ecosystem, PatternFly compatibility, team familiarity |
| Build | Vite | Fast dev loop, trivial proxy config, modern defaults |
| Server state | TanStack Query | oVirt is a poll-heavy API; Query's refetch/stale model replaces the entire saga layer |
| Client state | React context + hooks (add Zustand only if needed) | Almost all state is server state here |
| Routing | TanStack Router | Fully type-safe routes AND search params — folder selection, tag filters, and the oVirt search DSL all live in the URL |
| UI kit | PatternFly 6 (dark theme default) | Enterprise widget set (wizard, toolbar, tables, TreeView), a11y maintained by Red Hat, virtualization-console pedigree (Cockpit); PF6 dark theme carries the modern feel — we don't fight the system on styling |
| Data tables | @patternfly/react-table (+ virtualization extension for big inventories) | Sortable/filterable enterprise tables out of the box |
| Palette / extras | cmdk for the ⌘K command palette (PF has no equivalent — small custom island) | Keeps the vCenter-style quick-jump without leaving PF elsewhere |
| Charts | @patternfly/react-charts | Sparklines and dashboard tiles, PF-consistent |
| Console | @patternfly/react-console over the websocket-proxy (+ `.vv` download for virt-viewer/SPICE) | Ready-made noVNC/SPICE component — reclaims the custom-wrapper week |
| Tests | Vitest + React Testing Library; Playwright e2e vs lab engine | |
| Lint/format | ESLint (typescript-eslint strict) + Prettier | |
| CI | GitHub Actions: typecheck, lint, unit, build, osv-scanner audit | |

## Target layout (created in Phase 1)

```
app/
├── src/
│   ├── api/            # typed oVirt REST client
│   │   ├── transport.ts    # fetch wrapper: base URL, Bearer token, Accept: application/json, Filter header
│   │   ├── auth.ts         # SSO token acquire/refresh/revoke
│   │   ├── schemas/        # zod schemas per resource (vm, disk, nic, snapshot, ...)
│   │   └── resources/      # one module per API collection (vms.ts, disks.ts, ...)
│   ├── features/       # vertical slices: vm-list/, vm-details/, vm-create/, console/, snapshots/, ...
│   ├── components/     # shared presentational components
│   ├── hooks/          # useVms(), useVmActions(), usePermissions(), ...
│   ├── routes/         # route tree + guards
│   └── lib/            # utils, formatting, constants
├── e2e/                # Playwright specs (run against lab engine)
└── vite.config.ts      # dev proxy → https://engine.lab.local/ovirt-engine
```

---

## Phase 0 — Repo restructure & fork housekeeping  *(mostly done)*

- [x] Clone upstream, move legacy app to `legacy/` on branch `modernize`
- [x] New root README, lab guide in `docs/`
- [ ] `gh auth login`, then `gh repo fork oVirt/ovirt-web-ui --remote` and push
      `modernize` to the fork
- [ ] Stand up the lab engine per `docs/LAB-SETUP.md` (blocker for Phase 1 exit
      criteria — start it early, the deploy is ~35–90 min)
- [x] UI-kit decision (settled after weighing both ways): **PatternFly 6** —
      buys the enterprise widget set, maintained a11y, and the only
      ready-made React noVNC console; the modern feel comes from PF6's dark
      theme plus our interaction design, not from a custom kit. Rule: token
      overrides are fine, fighting PF component internals is not.

### Navigation IA (mirrors webadmin so admins feel at home)

Sidebar structure copies the current Admin Portal's menu (user request,
2026-07-01); unbuilt sections ship as designed "coming soon" stub pages so
the IA is complete from day one, then fill in by phase. RBAC (§3.6) later
hides sections the user's tier can't see.

| Section | Items (route) | Status (2026-07-02) |
|---|---|---|
| Dashboard | `/` | live — PF dashboard pattern: details/inventory rails, status + global utilization (host stats donuts + session sparklines), VM donut, activity feed |
| Compute | Virtual Machines `/vms` | live — full lifecycle, wizard, folders/labels, search DSL |
| | Templates `/templates` | live (read-only) |
| | Pools `/pools` | live (read-only) |
| | Hosts `/hosts` | live (read-only, admin-gated) |
| | Data Centers `/datacenters` | live (read-only, admin-gated) |
| | Clusters `/clusters` | live (read-only, admin-gated) |
| Network | Networks `/networks` | live (read-only) |
| | vNIC Profiles `/vnic-profiles` | live (read-only, admin-gated) |
| Storage | Storage Domains `/storage` | live (read-only, admin-gated) |
| | Disks `/disks` | live (read-only, admin-gated) |
| | Volumes `/volumes` | live (read-only, admin-gated) |
| Administration | Users `/users` | live (read-only, admin-gated) |
| | Quotas `/quotas` | live (read-only, admin-gated) |
| | Providers `/providers` | live (read-only, admin-gated) |
| | Errata `/errata` | live (read-only, admin-gated) |
| Events | `/events` | live — plus masthead bell/drawer |
| Monitoring Portal | external `/ovirt-engine-grafana` (new tab) | live (read-only, admin-gated) |

Implementation: PF `Nav` with `NavExpandable` groups, expanded state derived
from the active route; RBAC tier hides admin-only entries and empty groups.
No StubPage routes remain. Everything above is verified against the mock
(`npm run dev:mock`) with 216 unit tests + 18 Playwright e2e specs
(including an axe-core accessibility gate), all in CI. Beyond the table:
bulk VM actions, quick-look drawer, drag-to-folder (+ keyboard Move to
folder), host maintenance/activate, user settings (tunable poll interval,
preferred console), inventory virtualization (VITE_MOCK_SCALE), create-
from-template. The LIVE-ENGINE verification pass (tag parent wire shape,
createVm body, capability-tier derivation, SSO against Keycloak, .vv
format) and the noVNC console spike are owed once the lab engine is
reachable.

### Design language (north star)

- **Layout:** collapsible left inventory tree — PF TreeView — with folder
  view ⇄ cluster/host view toggle; breadcrumb + tab strip in the content
  pane; right-side detail drawer (PF Drawer) for quick looks without
  navigation
- **Interaction:** ⌘K command palette (cmdk — jump to VM, run action),
  keyboardable tables, drag-and-drop VMs into folders, bulk-select + bulk
  actions
- **Aesthetic:** PF6 dark theme as default (light supported), dense table
  density setting, status as colored dots + subtle pulse for transitional
  states, tag chips (PF Label) with per-tag color
- Benchmarks: vCenter's inventory model, Proxmox's density — polish within
  what PF6 theming gives us cheaply

---

## Phase 1 — Scaffold & foundations  *(2–4 weeks)*

**Goal:** a deployable walking skeleton: login via oVirt SSO, authenticated
API call, one real page, CI enforcing quality gates.

### 1.1 Toolchain
- Scaffold `app/` with Vite react-ts template; TS `strict: true`
- ESLint (typescript-eslint strict-type-checked) + Prettier + pre-commit hook
- Vitest + RTL wired; one smoke test
- GitHub Actions: typecheck → lint → test → build → `osv-scanner` on lockfile
- Dependabot (or Renovate) enabled on the fork

### 1.2 API transport
- `transport.ts`: fetch wrapper adding `Authorization: Bearer <token>`,
  `Accept: application/json`, `Version: 4`; JSON error envelope → typed
  `ApiError`
- **Filter header:** non-admin users need `Filter: true` on every request or
  the API returns permission errors — steal the logic from
  `legacy/src/ovirtapi/transport.js`
- Dev proxy in `vite.config.ts`: `/api` and `/sso` → `ENGINE_URL`, self-signed
  CA allowance behind an env flag (dev only)
- zod schemas for the first resources (VM, Cluster, Template) — validate at
  the boundary, derive TS types from schemas

### 1.3 Auth (the first hard integration)
- Token acquisition: `POST /ovirt-engine/sso/oauth/token` (password grant,
  `scope=ovirt-app-api`) for dev; document the prod path (same-origin, engine
  session) for Phase 4
- Token kept **in memory only** (module closure / context) — never
  localStorage/sessionStorage; page refresh = re-auth (acceptable; revisit
  with silent re-auth in Phase 4)
- Keep-alive ping + auto-logout on 401; token revocation on logout
  (`/sso/oauth/revoke`)
- Mine: `legacy/src/sagas/login.js` (flow), `legacy/src/config.js` (endpoints)

### 1.4 App shell
- PatternFly 6 init, dark theme default with light toggle; our few brand
  overrides live in one CSS-variables file (the "don't fight PF" rule)
- Shell per the design language: PF Page/Masthead, collapsible inventory
  sidebar (TreeView stub), ⌘K palette stub (cmdk), content pane, error
  boundary
- Route tree (TanStack Router) with auth guard; login page; "About/API info"
  page that renders live `GET /api` product info — proves the whole stack

**Exit criteria:** `yarn dev` against the lab engine → login as a non-admin
user → VM count from `GET /api/vms` rendered; CI green; README quickstart
works for a second developer.

---

## Phase 2 — Core VM lifecycle  *(done)*

**Goal:** daily-driver basics: see, start, stop, create, edit, delete VMs.

### 2.1 VM list
- `useVms()` on TanStack Query, `refetchInterval` ~10s while page visible
  (legacy equivalent: `legacy/src/sagas/background-refresh.js`)
- Table + card views, status icons (port the state machine in
  `legacy/src/vm-status.js` — it encodes every oVirt VM state), pagination via
  `max`/`search` params, name/status/cluster filtering
- OS icons come from the API (`legacy/src/sagas/osIcons.js` shows the caching
  trick)

### 2.2 VM details
- Overview tab: status, uptime, OS, cluster/host, IPs + FQDN (guest-agent
  data), utilization sparklines (`/vms/{id}/statistics`)
- Field-level transform knowledge: `legacy/src/ovirtapi/transform.js` is the
  Rosetta stone for API-shape → UI-shape (units, enums, nested ids)

### 2.3 VM operations
- Start / shutdown / power-off / reboot / suspend as TanStack mutations on
  `/vms/{id}/<action>`; async-task polling (`/jobs` or entity status) with
  optimistic status + toast on completion/failure
- Confirmation modals for destructive ops (power-off, delete)

### 2.4 Create / edit VM
- Wizard: template → name/description → cluster → CPU/memory (mind
  `memory_policy`: guaranteed vs max) → boot options → cloud-init
  (user/password/SSH key/network — legacy just added user+password options,
  see latest commits) → review
- Edit: subset of wizard as a form; handle next-run-configuration (changes
  that apply after restart) — the API flags this, surface it honestly
- Delete with "detach vs delete disks" choice

### 2.5 Folders & tagging  *(headline differentiator — vCenter-style organization)*
oVirt has **native hierarchical tags** (`/api/tags`, each tag has a `parent`;
assignable to VMs and hosts via `/vms/{id}/tags`). We build both features on
them — server-side, so organization roams across clients and reinstalls:
- **Folders** = a reserved tag subtree (root tag `ui.folders`; children form
  the tree). A VM lives in exactly one folder (enforce single-assignment in
  the UI). Sidebar folder view renders this tree; drag-and-drop VM → folder
  is an untag+tag pair; folder CRUD = tag CRUD under the root
- **Labels** = ordinary tags outside the reserved subtree, multi-assign,
  rendered as colored chips (color/emoji encoded in the tag description
  field — oVirt tags have name + description only)
- Filter bar and search integrate both: `folder:/prod/web tag:pci-dss
  status:up` compiles to client-side tag filtering + oVirt search DSL
- Tag manager UI (rename/re-parent/merge, orphan cleanup)
- Guard rail: non-admin users may lack tag-management permission — feature
  degrades to read-only chips; detect capability at login

**2026-07-05 parity pass (shipped):** folder **rename/re-parent** via
`PUT /tags/{id}` (Tag manager nested modals + dragging a folder onto a
folder; the picker excludes the moved folder's own subtree, the engine 409
backstops races); **subtree count badges** and collapsed-state memory
(`console-folder-tree`); **deep-linkable `?folder=<tag id>` URLs** with an
ancestor breadcrumb (Protected's login redirect now carries path + search);
**bulk Move to folder** (selection toolbar + multi-select drag, aggregate
toasts, batches never preselect); **read-only tree for the user tier** (all
management affordances hidden, filtering intact); the whole surface i18n'd
(`folders.*`/`tags.*`/`bulk.*`). Folder membership rides `?follow=tags` on
the VM/template list reads — the per-VM N+1 is gone. Templates join the same
tree via `/templates/{id}/tags`, and vCenter's dual navigation shipped as
**VMs & Templates** (combined typed rows) plus the structural **Hosts &
Clusters** view. Still open: `folder:`/`tag:` filter-bar tokens, folder
capture in saved bookmarks, and whether the VMs-page folder pane retires in
favor of the combined view.

**2026-07-11 right-click pass (shipped):** vCenter-style context menus via a
cursor-anchored `ContextMenu` primitive — folder nodes (new/rename/move/
delete folder, reusing the Tag manager's modals, now extracted for reuse),
VM/template rows (the row kebab's exact item set in a dual-mode
`contextMenu` prop, so right-click and kebab share one code path), and
hosts/clusters/DC tree nodes (Open details + the existing action sets).
Admin-gated where the underlying ops are; keyboard right-click (Shift+F10)
anchors to the focused node. Still open: context menus on the flat
Templates/Hosts list rows.

**Exit criteria:** create a VM from a template, boot it, watch status flow
through the list, edit memory, delete it — all from the new UI, verified by a
Playwright spec against the lab engine. Organize 20 VMs into a 3-level folder
tree with drag-and-drop, filter by label, and see the same structure after
logout/login (server-side persistence proven).

---

## Phase 3 — The hard 20%  *(done)*

**Goal:** the features that make it a real VM-management tool rather than a demo.

### 3.1 Consoles  *(hardest single feature — start first)*
- In-browser noVNC: fetch graphics consoles
  (`/vms/{id}/graphicsconsoles`), get a ticket, connect through the engine's
  **websocket-proxy**; mine `legacy/src/sagas/console/` for the
  ticket/handshake sequence and its `@patternfly/react-console` usage —
  we use the current PF6 equivalent, which brings the toolbar
  (ctrl-alt-del, fullscreen) and connect/disconnect states for free
- `.vv` file download for virt-viewer (SPICE and native VNC path)
- RDP option for Windows guests (legacy supports it — check feature flag)
- Failure UX: proxy not configured, ticket expiry, cert not trusted

### 3.2 Storage
- Disks tab: list/create/attach/detach/resize (grow only), bootable flag,
  storage-domain picker (`legacy/src/sagas/disks.js`,
  `legacy/src/sagas/storageDomains.js`)

### 3.3 Snapshots
- Create (with/without memory), preview/commit/undo semantics, restore,
  delete; snapshot tree view. The preview→commit flow has real footguns —
  test it hard against the lab

### 3.4 Networking
- NICs tab: add/remove/edit, vNIC profile picker, link up/down, MAC display

### 3.5 Migration & host placement
- Migrate to host (admin-ish; permission-gated), placement policy display

### 3.6 Permission-aware UI (the RBAC model — capability-gated UI)
One app for users AND admins; oVirt RBAC decides what renders:
- **Data scoping (IMPLEMENTED):** always server-side via the `Filter` header —
  `true` scopes to explicitly-permitted objects, `false` (admins) returns
  everything, including system-owned objects like the HostedEngine VM that
  carry no per-user permission. `transport.ts` drives it from an in-memory
  admin flag (`session.ts` `setSessionAdmin`) that `AuthProvider` sets ONLY
  from the server-verified capability profile (`/permissions` → administrative
  role); it defaults to `true` (least privilege) until confirmed. **Security
  invariant (docs/SECURITY.md §4), upheld:** the value derives from server
  data, and the engine independently rejects `Filter:false` from real
  non-admins — so no client value (spoofed or not) can escalate to unscoped
  data. Never filter visibility client-side for security.
- **Session capability profile:** at login, fetch the authenticated user +
  role assignments (`/users/{id}/permissions`, roles inherited through the
  object hierarchy); derive coarse tiers (user / power user / admin). Nav
  sections (Storage domains, Networks, Events firehose, later Hosts) render
  only for tiers that can see them (mine `legacy/src/sagas/roles.js`).
- **Action gating (layered):** status predicates (lib/vm-status) → role-tier
  checks → optimistic attempt with clean 403 toast as backstop (oVirt has no
  SelfSubjectAccessReview equivalent, so the backstop is load-bearing).
- **Deep-link degradation:** direct navigation to an unauthorized view gets a
  designed "not permitted" EmptyState — the fourth view state includes 403.

**Exit criteria:** open a noVNC console to a lab VM from the new UI; snapshot
→ revert cycle passes e2e; a user with UserRole (not admin) gets a coherent,
403-free experience.

---

## Phase 4 — Security & production hardening  *(first pass done; packaging/CI outstanding)*

**Goal:** something you'd let strangers log into.

- **Threat-model pass** (STRIDE-lite) over: token lifecycle, console tickets,
  websocket proxy, file downloads (`.vv`), error leakage
- **CSP**: strict (`default-src 'self'`; explicit `connect-src` for engine +
  wss proxy; no inline scripts) — verify PatternFly/noVNC comply
- **Auth hardening:** silent token refresh, revoke on logout, idle timeout;
  clickjacking (`frame-ancestors 'none'`), CSRF review (Bearer-token calls
  are CSRF-safe; any cookie-based session path is not — decide and document)
- **Supply chain:** lockfile pinning, `osv-scanner`/`yarn npm audit` gating CI,
  Dependabot auto-PRs, provenance checks for the noVNC dep
- **Deployment packaging:** production build served same-origin behind the
  engine's Apache (`/ovirt-engine/new-ui/` or replace `/web-ui/`) — kills CORS
  and cookie questions dead; deliver as RPM (crib `legacy/packaging/` +
  `legacy/ovirt-web-ui.spec.in`) *and* a static-assets container
- **Performance budget:** code-split routes, bundle < 500 KB gz initial,
  Lighthouse ≥ 90 perf/a11y on the VM list with 500 VMs (generate load on the
  lab engine via ansible `ovirt_vm` loop)
- Pen-test checklist run (OWASP ASVS L1 as the bar)

**Exit criteria:** security checklist signed off; RPM installs on the lab
engine and serves the UI same-origin; CI blocks on audit findings.

---

## Phase 5 — Polish & parity  *(largely done; i18n + release outstanding)*

- Dashboard (VM counts by status, per-folder/per-cluster utilization —
  @patternfly/react-charts tiles)
- Event log view (`/events`; legacy shows engine events per VM)
- **oVirt search DSL** passthrough (`search=name=web* and status=up`) — power
  users live on this; expose it in the list filter bar
- Accessibility audit (keyboard nav through wizard + console modal)
- i18n: react-intl is in (11 locales shipped, ~46 ids); the staged rollout to
  the remaining ~800 strings lives in [I18N-PLAN.md](I18N-PLAN.md) — Phase 0
  (English-base fallback + Partial locale typing) unblocks everything else
- User settings (refresh interval, preferred console) — legacy stores these
  in engine user options (`legacy/src/optionsManager.js`) — keep that trick,
  it makes settings roam
- Beta release to the fork's GitHub Releases; feedback loop

---

## Phase 6 — Full Admin Portal replacement  *(active — the mission)*

*(Originally "optional, incremental admin capabilities"; superseded by the
2026-07-04 scope decision — see Scope above. The original items 1–4 — hosts
view, storage domains view, events firehose, host maintenance/activate — all
shipped, and every entity now has webadmin-parity detail pages plus CRUD
where the engine allows it; see the Status snapshot for what's in flight
and what's next.)*

Transport note (implemented): admin sessions send `Filter: false`, driven by
the server-verified capability profile in `transport.ts`/`session.ts` —
never by a client-set flag alone.

## Legacy mining map

| Legacy file | What it teaches | Feeds phase |
|---|---|---|
| `legacy/src/ovirtapi/transport.js` | Auth header, JSON Accept, Filter header, error shapes | 1.2 |
| `legacy/src/sagas/login.js` | SSO token flow, keep-alive, logout | 1.3 |
| `legacy/src/ovirtapi/index.js` | Full inventory of endpoints the portal needs | 1.2, 2, 3 |
| `legacy/src/ovirtapi/transform.js` | API↔UI field mappings, units, enums | 2.2, 2.4 |
| `legacy/src/vm-status.js` | Complete VM state machine | 2.1 |
| `legacy/src/sagas/background-refresh.js` | Polling cadence/visibility strategy | 2.1 |
| `legacy/src/sagas/console/*` | Console ticket + noVNC/SPICE launch sequence | 3.1 |
| `legacy/src/sagas/disks.js`, `storageDomains.js` | Disk ops + domain constraints | 3.2 |
| `legacy/src/sagas/roles.js` | Permission/capability derivation | 3.6 |
| `legacy/src/optionsManager.js` | Server-side roaming user settings | 5 |
| `legacy/src/intl/` | Translated message catalogs | 5 |
| `legacy/packaging/`, `legacy/ovirt-web-ui.spec.in` | RPM/Apache integration for same-origin deploy | 4 |

## Effort summary

| Phase | Duration (1–2 devs) | Cumulative |
|---|---|---|
| 1 Scaffold & auth | 2–4 wks | 1 month |
| 2 Core lifecycle + folders/tags | 5–9 wks | ~3 months |
| 3 Hard 20% | 6–10 wks | ~5–6 months |
| 4 Security/hardening | 3–5 wks | ~6–7 months |
| 5 Polish (first pass) | 4+ wks | ~7–8 months |
| 6 Admin capabilities (optional) | 4–8 wks | ~9–10 months |

## Top risks

1. **Console/websocket-proxy integration** — most fiddly external dependency;
   de-risk by spiking it in Phase 1 spare cycles, not waiting for 3.1.
2. **oVirt project drift** — community-maintained post-RHV; pin the lab to a
   known engine version (4.5.x) and record it in `docs/LAB-SETUP.md`.
3. **PatternFly version churn & styling limits** — the 4→5→6 migrations were
   painful (it's why legacy froze on PF4/React 16). Mitigations: pin PF6,
   isolate brand overrides in one tokens file, and hold the "no fighting PF
   component internals" line — if a desired look needs surgery on PF
   markup, change the design, not the component. Custom islands (cmdk
   palette, drag-and-drop) stay small and separable.
4. **API JSON quirks** — the API is XML-first; JSON representations
   occasionally surprise (single-element arrays collapsing, string booleans).
   zod validation at the boundary catches these in dev, not in prod.
