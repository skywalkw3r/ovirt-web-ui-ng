# Releasing: versioning, signing, and publishing

How to turn a build into something hosts and clusters can *trust and update*.
This documents the process generically; none of it is automated in this repo
yet (see the honest list in [DEPLOY.md](DEPLOY.md)) — a tag-triggered CI
workflow is the natural implementation of everything below.

Two artifacts, two trust chains:

| Artifact                       | Signing                     | Distribution                            |
| ------------------------------ | --------------------------- | --------------------------------------- |
| RPM (integrated engine host)   | GPG (`rpmsign`) or Copr     | yum/dnf repo (self-hosted or Copr)      |
| Container image (podman / OpenShift) | cosign (Sigstore)    | any OCI registry; signature lives beside the image |

---

## 1. Versioning

`packaging/ovirt-web-ui-ng.spec` carries `@PACKAGE_RPM_VERSION@` /
`@PACKAGE_RPM_RELEASE@` placeholder tokens with no substitution pipeline —
CI stamps a throwaway `0.0.<run>` only to prove the spec builds. A real
release process derives the version from a git tag (`v1.2.0`), substitutes
the tokens (`sed`), and uses the same value for the container tag, so RPM
`%{version}` and image tag never drift.

The app version shown in the About dialog comes from `app/package.json`
(baked at build time via `__APP_VERSION__`); bump it in the same commit that
gets tagged.

## 2. RPM signing + publishing

### Option A — self-hosted (private/internal builds)

Signing is a GPG detached signature embedded in the RPM header; a repo is
just a directory with metadata. The whole pipeline:

```sh
# One-time: a dedicated signing key on a controlled machine (never an
# engine host). The 2y expiry forces rotation discipline.
gpg --quick-generate-key "Example Console Signing <team@example.com>" rsa4096 sign 2y
gpg --export -a "Example Console Signing" > RPM-GPG-KEY-example-console

# Per release: sign the built RPM
echo '%_gpg_name Example Console Signing' >> ~/.rpmmacros
rpmsign --addsign ovirt-web-ui-ng-*.rpm
rpm -K ovirt-web-ui-ng-*.rpm     # "digests signatures OK"

# Publish: repo dir + metadata, and sign the METADATA too (protects against
# tampered/rolled-back metadata, not just tampered packages)
mkdir -p /srv/repo/el9 && cp *.rpm /srv/repo/el9/
createrepo_c /srv/repo/el9
gpg --detach-sign --armor /srv/repo/el9/repodata/repomd.xml
```

Serve `/srv/repo` over HTTPS from anything — a plain web server, or
Artifactory/Nexus (both speak yum natively and add access control). Hosts
consume it with one file:

```ini
# /etc/yum.repos.d/example-console.repo
[example-console]
name=Example Console
baseurl=https://repo.example.com/el9
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://repo.example.com/RPM-GPG-KEY-example-console
```

Then the normal lifecycle applies: `dnf install ovirt-web-ui-ng`, upgrades
via `dnf update`; `%config(noreplace)` already preserves edited `config.js`.

In CI: import the private key from a secret, sign, push to the repo host.
The private key never touches an engine host — they only get the public key.

### Option B — Copr (public builds, zero infrastructure)

[Copr](https://copr.fedorainfracloud.org) is Fedora's free build service: it
builds SRPMs in clean mock chroots (pick `epel-9-x86_64`), **auto-signs with
a per-project key it manages**, and hosts the signed repo. Consumers need:

```sh
dnf copr enable youruser/ovirt-web-ui-ng
dnf install ovirt-web-ui-ng
```

Two constraints to know:

- **Everything is public** — packages, logs, the repo. Open-source license
  required. For internal-only builds use Option A instead.
- **Builds run offline** (no network in mock), so `npm ci` cannot run inside
  Copr. This repo is already compatible: the spec packages a **pre-built
  `app/dist`**, so CI runs `npm run build`, bundles `dist/` into the source
  tarball, creates the SRPM, and submits it (`copr-cli build`) — Copr only
  performs the offline-safe packaging step. (There is a per-project "enable
  internet access" toggle, but pre-building is the cleaner fix.)

oVirt itself ships nightlies via Copr (`ovirt/ovirt-master-snapshot`), so
the ecosystem precedent is established.

## 3. Container image signing (cosign / Sigstore)

Signatures are OCI artifacts stored in the registry next to the image —
nothing changes about push/pull. Always sign **by digest** (tags are
mutable; the digest is the artifact):

```sh
cosign generate-key-pair       # cosign.key (secret) + cosign.pub (distribute)

podman push registry.example.com/ovirt-web-ui-ng:1.2.0
cosign sign  --key cosign.key registry.example.com/ovirt-web-ui-ng@sha256:<digest>
cosign verify --key cosign.pub registry.example.com/ovirt-web-ui-ng@sha256:<digest>
```

- **Key-based** (above) suits internal use; keep `cosign.key` in a CI secret
  or, better, a KMS (`--key awskms://…` / Vault / Azure KV are native).
- **Keyless** mode signs with the CI job's OIDC identity and records it in
  the public Rekor transparency log — elegant for public projects, usually
  wrong for internal ones (the log is public).

### Making the signature enforce something

A signature nobody checks is decorative. Verification points:

- **OpenShift**: a `ClusterImagePolicy` (built-in sigstore verification) or
  the Kyverno / Sigstore `policy-controller` admission controller — e.g.
  "pods in this namespace may only run images verifiable with `cosign.pub`."
  This completes the GitOps chain from `packaging/openshift/`: ArgoCD/Git
  says *what* runs, admission control proves *it's your build*.
- **Plain podman hosts**: `/etc/containers/policy.json` + a `registries.d`
  entry pointing at the public key enforces the same at pull/run time.

## 4. The target end state (one workflow)

A `v*` tag triggers CI that:

1. builds the SPA (`npm ci && npm run build`),
2. substitutes the `@PACKAGE_RPM_*@` tokens from the tag, builds the RPM,
   signs it, publishes to the repo (Option A) or submits the SRPM (Option B),
3. builds the container image (`packaging/Containerfile`), pushes by tag,
   signs the digest with cosign,
4. attaches the tarball + RPM to a GitHub release for provenance.

Until that exists, every step above works manually.
