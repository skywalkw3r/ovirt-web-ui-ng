# Deploying the next-gen portal

How the production build gets onto (or in front of) an oVirt engine. The
detailed recipes live in [`packaging/README.md`](../packaging/README.md); this
page is the top-level story plus the honest list of what is _not_ done yet.
Before cutting over to a real engine, run the live-engine probe against it —
`npm run verify:engine` (`scripts/verify-live-engine.mjs`) re-checks every
assumption the mock fixtures bake in and exits non-zero on a mismatch.

## Same-origin, by design

The app is pure static assets (Vite build — no WAR, no servlet, unlike the
original ovirt-web-ui's `ovirt-web-ui.spec.in`). In production it is served
**same-origin** behind the engine's Apache at the sub-path
**`/ovirt-engine/web-ui-ng/`**, so it coexists with the legacy portal at
`/ovirt-engine/web-ui` during cutover.

Same-origin delivery is a security decision, not a convenience: every REST
call (`/ovirt-engine/api/*`), the SSO endpoints, and the console
websocket-proxy share the page origin — no CORS surface, no cross-origin
cookie questions, and the CSP keeps `default-src 'self'` (the authoritative
header set is [`SECURITY-HEADERS.md`](SECURITY-HEADERS.md)).

## 1. Build

```sh
cd app
npm ci
npm run build   # -> app/dist/
```

That is the deployable build: `vite.config.ts` defaults the production `base`
to `/ovirt-engine/web-ui-ng/`. Set `VITE_BASE` **only** to relocate the app to
a different sub-path — not for a normal build. Dev (`npm run dev`,
`npm run dev:mock`) always uses `/`.

The router already consumes the base — `app/src/routes/router.tsx` passes
`basepath: import.meta.env.BASE_URL` to `createRouter` — so there is **no
remaining src wiring step** for the sub-path.

### Where the base path is pinned

These must move together if the sub-path ever changes:

| Place                            | What                                      |
| -------------------------------- | ----------------------------------------- |
| `app/vite.config.ts`             | `PROD_BASE` (env-overridable `VITE_BASE`) |
| `packaging/ovirt-web-ui-ng.conf` | Apache `Alias` + `<Location>` headers     |
| `packaging/nginx-sample.conf`    | `location` blocks + fallback target       |
| `packaging/Containerfile`        | `ARG VITE_BASE` + dist copy destination   |

## 2a. RPM (integrated engine host)

Crib of the legacy packaging mechanism minus the WAR machinery: no
`engine.conf.d` registration (nothing for WildFly to mount), no branding
symlinks (brand tokens are compiled into the bundle at
`app/src/styles/brand-tokens.css`). Full recipe:
[`packaging/README.md` §2a](../packaging/README.md).

```sh
tar czf ovirt-web-ui-ng-0.1.0.tar.gz --transform 's,^,ovirt-web-ui-ng-0.1.0/,' \
    app/dist app/README.md packaging LICENSE
rpmbuild -ta ovirt-web-ui-ng-0.1.0.tar.gz --define '_topdir '"$PWD"'/rpmbuild'
```

(Substitute the `@PACKAGE_RPM_*@` tokens in the spec with concrete values
first; CI does this with a throwaway `0.0.<run>` version.)

| Installed path                             | Purpose                                                               |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `/usr/share/ovirt-engine/ovirt-web-ui-ng/` | the static SPA build                                                  |
| `/etc/httpd/conf.d/ovirt-web-ui-ng.conf`   | Apache Alias + SPA fallback + security headers (`%config(noreplace)`) |

`%post` reloads httpd (best-effort), so asset-only bumps need no engine
restart. The engine's Apache keeps owning `/ovirt-engine/api`, `/sso`, and the
websocket-proxy — the RPM adds only its own Alias.

## 2b. Container (SPA as its own pod, reverse-proxying the engine)

```sh
podman build -f packaging/Containerfile -t ovirt-web-ui-ng:latest .
podman run --rm -p 8080:8080 \
    -e ENGINE_ORIGIN=https://engine.lab.example.com \
    ovirt-web-ui-ng:latest
```

nginx serves the static build at the same sub-path **and** proxies an
allowlist of engine API paths (REST, SSO token grant, sign-out, Grafana query
API) to `ENGINE_ORIGIN`, so the browser still sees one origin; engine HTML is
never served from the console origin. TLS verification on the nginx→engine hop
is **on** by default and expects the engine CA at
`/etc/pki/ovirt-engine/ca.pem` — mount it, or (labs only) flip
`proxy_ssl_verify off` in `nginx-sample.conf`.

## 2c. OpenShift / ArgoCD

The container image from §2b, deployed via the Kustomize base in
[`packaging/openshift/`](../packaging/openshift/) (Deployment + Service +
edge-TLS Route + a ConfigMap-mounted `config.js`). The recommended
multi-engine shape there is the **same-origin path proxy**: `config.js` lists
each engine as a `/e/<slug>` entry and a ConfigMap-mounted nginx
`default.conf` carries one `location /e/<slug>/` block per engine, proxying
to it over verified TLS — no CORS, no `CSP_CONNECT_EXTRA`. Environment
specifics — image tag, the engine list, the nginx engine map, the Route host —
live in a Git overlay that ArgoCD syncs; editing `config.js` in Git rolls the
pods (hashed configMapGenerator). Full recipe and an ArgoCD `Application` example:
[`packaging/openshift/README.md`](../packaging/openshift/README.md).

## Environments and the delivery pipeline (OpenShift)

Environments build from **git branches**, in-cluster, with GitOps-managed
manifests — the same workflow as our other OpenShift services (a private
Bitbucket repo as the build source, Bitbucket webhooks into the BuildConfig,
Kustomize `base/` + `overlays/<env>/<cluster>/`, one ArgoCD Application per
environment, SealedSecrets for the webhook token). The live manifests carry
internal hostnames and live in a private deploy repo; `packaging/openshift/` is
the sanitized template.

| Branch | Environment | How it moves |
| --- | --- | --- |
| `development` | dev console | every push. The Bitbucket webhook starts the Git-source `BuildConfig` (`packaging/Containerfile`) within seconds; the Deployment's image trigger rolls the pods. |
| `production` | prod console | **only** via `make promote-prod` (`scripts/promote-prod.sh`): a `--no-ff` merge of `development` after a trial merge and a "no hotfix left behind" check. The prod webhook builds the result. |
| `main` | public GitHub default | fast-forwarded to `production` by the same script so the mirror shows released code. |

The repo has one fetch URL (GitHub) and two push URLs (Bitbucket, which the
cluster clones with a read-only access key, and GitHub, which runs the Actions
gates: lint, typecheck, unit tests, e2e, container and RPM builds). Config
(`config.js`, the nginx engine map) and manifests change through the deploy
repo and are synced by ArgoCD; image rollback is `oc tag` to a previous
ImageStream digest. `make deploy-status ENV=dev|prod` shows builds, the
webhook URL, the rollout and the ArgoCD state.

## Connecting to multiple engines (proxy/external deployments only)

By default the console is bound to one engine (same-origin), exactly as
described above. In **proxy/external** deployments (container, OpenShift),
listing engines under `servers` in `config.js` (see `app/public/config.js`
for the annotated reference) adds a **Server picker to the login page**; the
list is deployer-controlled only — users cannot add servers in the browser,
and their last pick is remembered per browser (localStorage).

**The integrated RPM deployment is single-engine by design.** Multi-engine is
a build-time capability (`VITE_MULTI_ENGINE=1`, set by the Containerfile);
the RPM ships the default build where the capability is compiled out, so a
`servers` block in `config.js` on an engine host is ignored — the picker
cannot be enabled there.

| Path                | Multi-engine | Engine list                        | CSP extra origins                      |
| ------------------- | ------------ | ---------------------------------- | -------------------------------------- |
| RPM on engine host  | not available (by design) | —                     | —                                      |
| Container (podman)  | yes          | mount/edit `config.js`             | `-e CSP_CONNECT_EXTRA='https://…'`     |
| OpenShift / ArgoCD  | yes          | ConfigMap (`packaging/openshift/`) | none for `/e/<slug>` proxy entries; `CSP_CONNECT_EXTRA` env only for direct-connect entries |

Each listed engine is reached one of two ways. The shipped model is a
**same-origin path proxy**: give the engine a `/e/<slug>` `url` in `config.js`
and have the console's nginx forward that path to it, so the browser only ever
talks to the console's origin — **no CORS**, and `connect-src` stays `'self'`.
Alternatively a **direct cross-origin** entry (an absolute `https://` origin)
needs the origin added to the CSP `connect-src` **and** a one-time engine-side
CORS enablement — `engine-config` for the REST API plus a CORS-fixed enginesso
build for SSO login (both spelled out inline in
[`app/public/config.js`](../app/public/config.js)). Either way, users' browsers
must trust each engine's TLS certificate.

Sessions are per-engine: signing in binds the tab to the picked engine, a
token is never sent to a different engine, and switching engines happens on
the login page.

## CI coverage

`.github/workflows/ci.yml` gates every push/PR: lint → typecheck → unit tests
→ production build → `npm audit --audit-level=high`, then Playwright e2e. Two
packaging-validation jobs consume that build: `container` runs the full
two-stage `docker build` of `packaging/Containerfile`, and `rpm` runs a real
`rpmbuild -ta` on AlmaLinux 9 against the pre-bundled dist artifact. Actions are SHA-pinned; Dependabot
(`.github/dependabot.yml`) keeps the pins and the npm tree current. Promotion
to production is a git merge (`make promote-prod`), not a CI job — see the
pipeline section above.

## Releasing (signing & publishing)

Turning a build into a trusted, updatable artifact — version stamping, RPM
signing and repo publishing (self-hosted GPG or Copr), and cosign signing +
admission-time verification for the container image — is documented in
[RELEASING.md](RELEASING.md). Not yet automated; every step works manually.
