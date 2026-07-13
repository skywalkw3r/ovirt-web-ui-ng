# ovirt-web-ui-ng

[![ci](https://github.com/skywalkw3r/ovirt-web-ui-ng/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/skywalkw3r/ovirt-web-ui-ng/actions/workflows/ci.yml)

A modern, secure, fast web console for [oVirt](https://www.ovirt.org/) / OLVM —
a clean-break rebuild that **converges oVirt's two separate web frontends**, the
self-service **VM Portal** (`ovirt-web-ui`) and the admin **Administration
Portal** (`webadmin`), into a single RBAC-driven UI built against the oVirt 4.5
REST API.

> **React 19 · TypeScript (strict) · Vite · TanStack Query/Router · PatternFly 6 · dark-theme-first**

## Quickstart

```bash
cd app && npm ci && npm run dev:mock
```

`dev:mock` needs no live engine — it serves in-repo fixtures. Sign in as
`admin@internal` (any password) for the admin tier, or `demo@internal` for the
user tier.

To point at a real engine, use `npm run dev` (proxy in
[`app/vite.config.ts`](app/vite.config.ts); set `ENGINE_URL` in `app/.env`).

## Two oVirt frontends, one console

Historically, oVirt shipped **two** web UIs against the same engine:

| Origin | What it was | Audience |
| ------ | ----------- | -------- |
| **`ovirt-web-ui` (VM Portal)** | React 16 / Redux-saga / PatternFly 4 self-service portal | end users |
| **`webadmin` (Administration Portal)** | GWT admin UI bundled on the engine host | admins / operators |

`ovirt-web-ui-ng` is a **from-scratch rewrite that unifies both**. One app, one
RBAC model — the engine's `Filter` header plus a capability tier (`user` /
`admin`) gates navigation and actions, so end users and administrators share the
same console instead of two divergent portals. It began by studying (and
building alongside) `ovirt-web-ui` for its VM-lifecycle, SSO, and console
lineage, then grew to cover the Administration Portal's surface — each admin
dialog validated against webadmin's UiCommon field models — so the GWT portal
can eventually be retired. It shares **no runtime code** with either.

### How it diverges from both originals

- **Single unified app**, not two portals — no separate user/admin builds.
- **Modern stack** (React 19 / TypeScript strict / PatternFly 6 / Vite) vs.
  React 16 (`ovirt-web-ui`) and GWT (`webadmin`).
- **Multi-engine aware** — an optional deploy-time server list lets one console
  connect to several engines (neither original could). Build-gated: the
  integrated RPM stays single-engine; the container build opts in.
- **Two deploy shapes** — integrated on the engine host (RPM, same-origin SSO)
  *and* standalone (container / OpenShift). See [Deployment](#deployment).
- **Security-first by construction** — bearer token in memory only, strict CSP
  from day one, no raw HTML injected into the DOM. See
  [`docs/SECURITY.md`](docs/SECURITY.md) / [`docs/SECURITY-HEADERS.md`](docs/SECURITY-HEADERS.md).
- **Grafana / Data-Warehouse history** for monitoring charts — an integration
  the original portals didn't offer standalone; some DWH-heavy webadmin
  analytics are still approximated from live REST and deferred (tracked in
  [`docs/GAP-ANALYSIS.md`](docs/GAP-ANALYSIS.md)).

## Status

A unified user/admin console at broad **oVirt 4.5 Administration-Portal parity**
across **Compute / Network / Storage / Administration**, reached through
successive review-and-implement waves. 43 routed pages; the remaining honest
gaps are tracked in [`docs/GAP-ANALYSIS.md`](docs/GAP-ANALYSIS.md).

- **Compute** — full VM lifecycle (create wizard with cloud-init/sysprep, bulk
  actions, snapshots / disks / NICs, migration, console launch incl. RDP), a
  staged Edit VM modal with Run Once depth, cluster-depth dialog + affinity
  CRUD, host add/install + fence agents + Discover iSCSI + NUMA/vGPU, pools,
  instance types, data centers, and the _Hosts & Clusters_ / _VMs & Templates_
  inventory trees.
- **Network** — host network setup (bonds, SR-IOV, per-attachment QoS, NIC
  labels), MAC pools, vNIC profiles with custom properties, and network
  detail subtabs.
- **Storage** — storage-domain lifecycle (NFS / iSCSI / FC, import + LUN
  extend/reduce), disk profiles, disk snapshots, register-from-storage with
  advanced mappings, image import, and Gluster volumes.
- **Administration** — users + directory groups with detail pages, roles,
  system permissions, quotas with limit editors, scheduling policies, external
  providers, and errata.
- **Platform** — the oVirt search DSL, ⌘K command palette, dashboard,
  Grafana/DWH monitoring history, notification / tasks drawers (with
  correlation-id), bookmarks, right-click context menus, resizable/persisted
  table columns, admin **Platform Settings** (custom branding, MOTD +
  scheduled announcement banners), optional **multi-engine** server picker, and
  light/dark themes across 11 locales.

Backed by **~2,000 unit tests** plus Playwright e2e with an axe accessibility
gate. A few webadmin features are deliberately deferred because oVirt 4.5
exposes no REST surface for them (Active User Sessions, hosted-engine
global-HA toggle, SMTP/SNMP notifier transport, Foreman host discovery); the
phased roadmap lives in [`docs/PLAN.md`](docs/PLAN.md).

## Deployment

Two supported shapes (details in [`docs/DEPLOY.md`](docs/DEPLOY.md),
release/signing in [`docs/RELEASING.md`](docs/RELEASING.md)):

- **Integrated (RPM)** — static assets served by the engine host under
  `/ovirt-engine/web-ui-ng/`; same-origin, reuses engine SSO via the injected
  session token, always single-engine. See
  [`packaging/ovirt-web-ui-ng.spec`](packaging/ovirt-web-ui-ng.spec).
- **Standalone (container / OpenShift)** — served separately (nginx image),
  multi-engine-capable; each target engine needs REST + SSO **CORS** and a CSP
  `connect-src` entry. Manifests in [`packaging/openshift/`](packaging/openshift/),
  engine-side CORS drop-in in [`packaging/engine-cors/`](packaging/engine-cors/).

## Repository layout

| Path           | What it is                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`         | The console. `npm run dev:mock` runs it against built-in fixtures — no engine needed.                                                                                                                              |
| `packaging/`   | Deploy artifacts: RPM spec, `Containerfile`, nginx config, `openshift/` manifests, `engine-cors/` drop-in.                                                                                                         |
| `lab/ansible/` | Fully automated single-node oVirt lab: Proxmox VM (nested virt) → CentOS Stream 9 node → self-hosted engine. See its README.                                                                                        |
| `docs/`        | [`PLAN.md`](docs/PLAN.md) (roadmap, IA), [`COMPONENTS.md`](docs/COMPONENTS.md) (PF6 map + design rules), [`GAP-ANALYSIS.md`](docs/GAP-ANALYSIS.md), [`DEPLOY.md`](docs/DEPLOY.md), [`RELEASING.md`](docs/RELEASING.md), security & lab references. |

## Acknowledgements

**ovirt-web-ui-ng** is a new, from-scratch web console for oVirt. It would not
exist without the two frontends that came before it.

- **[oVirt/ovirt-web-ui](https://github.com/oVirt/ovirt-web-ui)** — the
  React 16 / Redux-saga / PatternFly 4 **VM Portal**. This project began by
  studying and building alongside it (VM lifecycle, SSO, console launching).
- **[oVirt webadmin (ovirt-engine)](https://github.com/oVirt/ovirt-engine)** —
  the GWT **Administration Portal**. Its UiCommon dialog models and feature
  inventory were the reference for admin-parity work.

ovirt-web-ui-ng is a clean-break rewrite and shares **no runtime code** with
either. Sincere thanks to everyone who wrote and maintained them.

## License

Apache-2.0, same as upstream oVirt. See [`LICENSE`](LICENSE).
