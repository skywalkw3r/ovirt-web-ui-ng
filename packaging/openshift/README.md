# OpenShift / ArgoCD deployment

Kustomize base for running the console as a pod on OpenShift, GitOps-managed.
The same image as the local docker/podman path (`packaging/Containerfile`);
everything environment-specific is a couple of env vars plus ConfigMap-mounted
files — `config.js`, and for multi-engine the nginx `default.conf` — so there
are no image rebuilds between environments.

## The image

`packaging/Containerfile` is a two-stage **Red Hat UBI** build:
`ubi9/nodejs-24` runs `npm ci && npm run build`, then `ubi9/ubi-minimal` plus
the AppStream nginx serves `dist/` on port 8080. The serve stage has no `user`
directive, keeps pid/temp files under `/tmp` and group-0-owns everything nginx
touches, so it runs as-is under the restricted SCC's random UID — no `anyuid`.
Multi-engine support is compiled in (`VITE_MULTI_ENGINE=1`).

Build it wherever suits you — a Git-source `BuildConfig` on this repo with the
Docker strategy and `dockerfilePath: packaging/Containerfile`, or by hand:

```sh
podman build -f packaging/Containerfile \
    --build-arg VITE_CSP_CONNECT_EXTRA= \
    -t quay.io/yourorg/ovirt-web-ui-ng:1.0.0 .
podman push quay.io/yourorg/ovirt-web-ui-ng:1.0.0
```

The empty `VITE_CSP_CONNECT_EXTRA` is for the same-origin proxy shape below:
it bakes a strict `<meta>` CSP with no serve-time placeholder. Drop the
argument to keep the placeholder for the direct-connect alternative.

## Two runtime shapes, one image

### Recommended: same-origin path proxy (multi-engine, no CORS)

Every engine gets a path prefix on the console's own origin. `config.js` lists
each engine as a `/e/<slug>` entry, and the pod's nginx carries one
`location /e/<slug>/` block per engine that strips the prefix and proxies
`/ovirt-engine/*` (REST, SSO, websocket-proxy) to that engine over verified
TLS. The browser only ever talks to the console's origin, so:

- **no CORS** on any engine — no `engine-config` change, no enginesso build;
- **no `CSP_CONNECT_EXTRA`** — `connect-src` stays `'self' wss:`;
- users' browsers trust only the console Route's certificate.

Wiring:

1. Write a `default.conf` and mount it read-only over
   `/etc/nginx/conf.d/default.conf`. Start from `nginx-sample.conf`: keep its
   `map` blocks and the static-app `location` (security headers and all),
   replace the `${…}` placeholders by hand (nothing runs envsubst on a mounted
   file) and drop the `sub_filter` lines, remove the `${ENGINE_ORIGIN}` proxy
   block, and add one block per engine. The entrypoint sees a read-only
   `default.conf` and skips rendering the single-engine template. Outline of
   one engine block — adapt it, don't paste it blindly:

   ```nginx
   # Slug 'he1' -> engine1.example.com. Repeat per engine.
   location /e/he1/ {
       set $engine engine1.example.com;   # a variable upstream is resolved per
       rewrite ^/e/he1/(.*)$ /$1 break;    # request via `resolver`, so one dead
       proxy_pass https://$engine;         # engine never blocks nginx startup
       proxy_set_header Host $engine;
       proxy_ssl_server_name on;
       proxy_ssl_name $engine;
       proxy_ssl_verify on;
       proxy_ssl_trusted_certificate /etc/pki/tls/certs/ca-bundle.crt;
       proxy_http_version 1.1;             # websocket-proxy upgrade
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection $connection_upgrade;
       proxy_read_timeout 3600s;
       proxy_send_timeout 3600s;
   }
   ```

   `proxy_ssl_trusted_certificate` points at the **image's system CA bundle**
   (`/etc/pki/tls/certs/ca-bundle.crt` on UBI), so every engine must present a
   publicly trusted certificate with its full chain. No `engine-ca` ConfigMap
   is involved in this shape. The `resolver` a variable upstream needs is set
   in `nginx.conf.template` from the pod's `/etc/resolv.conf`.
2. `config.js`: one `{ name, url: '/e/<slug>', fqdn }` entry per engine (see
   the file here). Adding or removing an engine means editing the nginx blocks
   **and** `config.js` together.
3. Leave `ENGINE_ORIGIN` and `CSP_CONNECT_EXTRA` at their defaults — both are
   dormant once `default.conf` is mounted — and drop the `engine-ca` volume
   from the Deployment (or leave it; it is unused). The commented-out
   `nginx-config` mount in `deployment.yaml` shows where the file goes.

### Alternative: single engine, optionally with direct-connect extras

With no `default.conf` mounted, the entrypoint renders the baked
`nginx-sample.conf` with `ENGINE_ORIGIN`: the pod proxies `/ovirt-engine/*` to
that one engine same-origin. This shape verifies the nginx→engine TLS hop
against `/etc/pki/ovirt-engine/ca.pem`, which is why the base Deployment
mounts the `engine-ca` ConfigMap (nginx refuses to start when the file is
missing) — create it once per namespace:

```sh
curl -ko engine-ca.pem 'https://engine1.example.com/ovirt-engine/services/pki-resource?resource=ca-certificate&format=X509-PEM-CA'
oc create configmap engine-ca --from-file=ca.pem=engine-ca.pem
```

Further engines can then be added as **direct-connect** entries (an absolute
`https://` origin in `config.js`). Each one needs: its origin in
`CSP_CONNECT_EXTRA` (space-separated; it feeds both the CSP response header
and the `<meta>` CSP via nginx `sub_filter`), the one-time engine-side CORS
enablement — `engine-config -s CORSSupport=true -s CORSAllowedOrigins=https://<console-origin>`
for the API plus an engine build with the fixed enginesso CORS mapping for
SSO — and a TLS certificate the users' browsers trust. The Route host is the
console's origin: that exact `https://` origin is what goes into each engine's
`CORSAllowedOrigins`. Prefer the path proxy; keep this for engines you cannot
front.

## Deploy

Direct: `oc apply -k packaging/openshift/` (after editing `config.js`, the
`images:` block in `kustomization.yaml`, and — for the path-proxy shape —
adding your `default.conf` ConfigMap and its mount).

ArgoCD — point an Application at an **overlay** repo/dir that references this
base and patches the environment specifics:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ovirt-web-ui-ng
  namespace: openshift-gitops
spec:
  project: default
  source:
    repoURL: https://git.example.com/infra/console-deploy.git
    targetRevision: main
    path: overlays/prod        # kustomization.yaml with `resources: [../../base]`
  destination:
    server: https://kubernetes.default.svc
    namespace: ovirt-console
  syncPolicy:
    automated: { prune: true, selfHeal: true }
```

A typical overlay patches: the `images:` tag (or an ImageStream trigger), the
Route `host`, its own `config.js` and nginx `default.conf` (engine list per
environment), and — direct-connect shape only — `ENGINE_ORIGIN` /
`CSP_CONNECT_EXTRA`. Because `config.js` rides a hashed configMapGenerator
name, an engine-list change in Git rolls the pods on sync; generate the nginx
ConfigMap the same way so a proxy-map change rolls them too.
