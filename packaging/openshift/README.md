# OpenShift / ArgoCD deployment

Kustomize base for running the console as a pod on OpenShift, GitOps-managed.
The same image as the local docker/podman path (`packaging/Containerfile`);
everything environment-specific is env vars + one ConfigMap-mounted
`config.js` — no image rebuilds between environments.

## One-time: build & push the image

```sh
podman build -f packaging/Containerfile -t quay.io/yourorg/ovirt-web-ui-ng:1.0.0 .
podman push quay.io/yourorg/ovirt-web-ui-ng:1.0.0
```

(The image uses `nginxinc/nginx-unprivileged` so it runs under the restricted
SCC's random UID — no `anyuid` needed.)

## One-time per namespace: the engine CA

nginx verifies TLS on the pod→engine proxy hop (`proxy_ssl_verify on`) and
reads the CA from `/etc/pki/ovirt-engine/ca.pem`; the Deployment mounts it
from a ConfigMap named `engine-ca` and **will not serve without it**:

```sh
curl -ko engine-ca.pem 'https://engine1.example.com/ovirt-engine/services/pki-resource?resource=ca-certificate&format=X509-PEM-CA'
oc create configmap engine-ca --from-file=ca.pem=engine-ca.pem
```

## Deploy

Direct: `oc apply -k packaging/openshift/` (after editing `deployment.yaml`
env + `config.js` + the `images:` block in `kustomization.yaml`).

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

A typical overlay patches: the `images:` tag, `ENGINE_ORIGIN`,
`CSP_CONNECT_EXTRA`, the Route `host`, and swaps in its own `config.js`
(engine list per environment). Because `config.js` rides a hashed
configMapGenerator name, an engine-list change in Git rolls the pods on sync.

## The multi-engine wiring, end to end

1. `config.js` (here) lists the engines — see the entry-kind comment in that
   file: the console's own Route origin = proxied default engine (no CORS);
   any other origin = direct connection.
2. `CSP_CONNECT_EXTRA` (deployment.yaml) lists the direct-connection origins,
   space-separated — it feeds both the CSP response header and the `<meta>`
   CSP baked into `index.html` (swapped at serve time via nginx `sub_filter`).
3. Each direct-connection engine gets the one-time CORS enablement:
   `packaging/engine-cors/README.md` (engine-config for the API + web.xml fix
   or Apache drop-in for SSO).
4. The Route host is the console's origin — that exact `https://` origin is
   what goes into each engine's `CORSAllowedOrigins` / drop-in allowlist.
