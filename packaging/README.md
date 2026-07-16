# Packaging & deployment -- ovirt-web-ui-ng

The next-gen VM Portal is a **Vite static build** (React 19 + TypeScript). It is
not a Java WAR like the legacy portal -- there is no servlet and no SSO filter
chain. The engine's own SSO login page authenticates the user and, on redirect
back to our app, a bootstrap script injects `window.userInfo` (the SSO token,
username, etc). Our SPA reads that global at boot (`app/src/auth/bootstrap.ts`)
and calls the **same-origin** `/ovirt-engine/api` REST endpoints. This app runs
_alongside_ the GWT Administration Portal and replaces only the VM Portal.

Three deploy targets are provided:

| Target        | File(s)                                        | Use when                                                                                                             |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **RPM**       | `ovirt-web-ui-ng.spec`, `ovirt-web-ui-ng.conf` | Installing onto an integrated engine host; Apache serves the assets.                                                 |
| **Container** | `Containerfile`, `nginx-sample.conf`           | Running the SPA as its own pod/container with a reverse proxy to the engine (demos, local podman/docker, air-gapped previews). |
| **OpenShift** | `openshift/` (Kustomize base)                  | GitOps/ArgoCD-managed deployment of the container image; see `openshift/README.md`.                                 |

Signing and publishing the artifacts (GPG or Copr for the RPM, cosign for
the container image) is documented in `docs/RELEASING.md` — not yet
automated, all steps work manually.

Multi-engine (one console connecting to several hosted engines) is a
**proxy/external-deploy feature only**: the Containerfile compiles it in
(`VITE_MULTI_ENGINE=1`); the integrated RPM ships the default build where the
capability does not exist, so an engine-host install is always single-engine.
Enabling it on container/OpenShift: `servers` in `config.js` — each engine
either a same-origin `/e/<slug>` proxy path (no CORS) or an absolute https
origin that needs the `CSP_CONNECT_EXTRA` env plus one-time engine-side CORS
(`engine-config`). Overview: `docs/DEPLOY.md` §"Connecting to multiple
engines".

Both serve the app from the **same sub-path**, `/ovirt-engine/web-ui-ng/`, so
the token-injection flow and all relative API calls behave identically. That
sub-path is pinned in three places that must move together:

1. `app/vite.config.ts` `base` (env-overridable via `VITE_BASE`)
2. the RPM's httpd Alias in `ovirt-web-ui-ng.conf`
3. the container's `nginx-sample.conf` `location` blocks

---

## 1. Build the static app

```sh
cd app
npm ci
VITE_BASE=/ovirt-engine/web-ui-ng/ npm run build
# -> app/dist/  (index.html + content-hashed assets/)
```

`VITE_BASE` makes every asset URL absolute under the sub-path so the app loads
correctly when served from `/ovirt-engine/web-ui-ng/` rather than site root.
For a local `npm run dev` you do **not** set `VITE_BASE` -- dev uses `/`.

---

## 2a. Package as an RPM (integrated engine host)

The spec follows the legacy **pre-bundled** model: by default it expects
`app/dist/` to already exist in the source tree (built as above), so the build
host needs no Node toolchain.

```sh
# Produce a source tarball whose top dir is ovirt-web-ui-ng-<version>/ and
# which contains app/dist/, packaging/, LICENSE.
tar czf ovirt-web-ui-ng-0.1.0.tar.gz --transform 's,^,ovirt-web-ui-ng-0.1.0/,' \
    app/dist app/README.md packaging LICENSE

rpmbuild -ta ovirt-web-ui-ng-0.1.0.tar.gz \
    --define '_topdir '"$PWD"'/rpmbuild'
```

To build the SPA _inside_ the RPM build instead (requires `nodejs`/`npm` on the
build host), pass `--define 'build_from_source 1'` and ship `app/` sources (not
just `app/dist`) in the tarball.

> The `@PACKAGE_RPM_VERSION@` / `@PACKAGE_RPM_RELEASE@` tokens in the spec are
> placeholders substituted by the release tooling (as in the legacy
> `ovirt-web-ui.spec.in`). For a manual build, replace them with concrete
> values first, e.g. `Version: 0.1.0` / `Release: 1%{?dist}`.

### What the RPM installs

| Path                                       | Purpose                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `/usr/share/ovirt-engine/ovirt-web-ui-ng/` | the static SPA build                                                    |
| `/etc/httpd/conf.d/ovirt-web-ui-ng.conf`   | Apache `Alias` + SPA fallback + security headers (`%config(noreplace)`) |

`%post` runs `systemctl reload httpd` so the alias/headers apply without a full
engine restart (asset-only bumps are hot). The `.conf` is marked
`noreplace` so local header/CSP tweaks survive upgrades.

---

## 2b. Build a container image

```sh
podman build -f packaging/Containerfile \
    --build-arg VITE_BASE=/ovirt-engine/web-ui-ng/ \
    -t ovirt-web-ui-ng:latest .

podman run --rm -p 8080:8080 \
    -e ENGINE_ORIGIN=https://engine.lab.example.com \
    ovirt-web-ui-ng:latest
# browse http://localhost:8080/  -> redirects to the app
```

`nginx-sample.conf` serves the static build at the sub-path **and** reverse
proxies everything else under `/ovirt-engine/` (REST, SSO, and the
websocket-proxy with WebSocket upgrade) to `${ENGINE_ORIGIN}`, so the browser
only ever talks to this one origin. The image listens on **8080** and runs
unprivileged (no root, no `NET_BIND_SERVICE`).

`proxy_ssl_verify` is **on** by default (secure-by-default): mount the engine
CA at `proxy_ssl_trusted_certificate` (`/etc/pki/ovirt-engine/ca.pem`). For a
lab with self-signed engine certs only, flip it to `off` — the commented
opt-in in `nginx-sample.conf`, never the shipped default.

---

## 3. Security response headers

Both deploys emit the headers documented in `docs/SECURITY-HEADERS.md`. The key
one that **cannot** be expressed as a `<meta>` CSP is `frame-ancestors 'none'`
-- it must be an HTTP header, which is why both `ovirt-web-ui-ng.conf` (Apache)
and `nginx-sample.conf` set the full CSP as a response header. `style-src`
carries `'unsafe-inline'` because PatternFly 6 and Victory inject inline styles
at runtime; `script-src` does **not**.

---

## Assumptions & notes

- **httpd conf.d path**: the RPM drops its Alias in `/etc/httpd/conf.d/`. The
  exact include directory used by the engine's Apache is engine-version
  specific; if your engine uses a dedicated vhost include dir, move the file
  accordingly. Verify at cutover (see `docs/LIVE-ENGINE-CHECKLIST.md`).
- **Engine still owns `/ovirt-engine/api`, `/sso`, `/websocket-proxy`**: the RPM
  path relies on the engine's existing Apache config to proxy those; we add only
  our own Alias and never touch theirs. The container path proxies them itself.
- **Version tokens**: `@PACKAGE_*@` are release-tool placeholders, matching the
  legacy `.spec.in` convention.
- **Not built/tested here**: `rpmbuild` and `podman` were unavailable in the
  authoring environment; these files were written and self-reviewed against the
  legacy spec (`legacy/ovirt-web-ui.spec.in`) and standard httpd/nginx. Run a
  real `rpmbuild -ta` and `podman build` before relying on them.
