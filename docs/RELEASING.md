# Releasing: versioning, signing, and publishing

How to turn a build into something hosts and clusters can *trust and update*.
Versioning, the RPM/SRPM build, the GHCR image push, provenance and the
GitHub release are automated by `.github/workflows/release.yml` on every `v*`
tag (see §4). Signing (`rpmsign`, cosign) and dnf-repo publishing are not yet
automated; those steps below still work manually.

Two artifacts, two trust chains:

| Artifact                       | Signing                     | Distribution                            |
| ------------------------------ | --------------------------- | --------------------------------------- |
| RPM (integrated engine host)   | GPG (`rpmsign`) or Copr     | yum/dnf repo (self-hosted or Copr)      |
| Container image (podman / OpenShift) | cosign (Sigstore)    | any OCI registry; signature lives beside the image |

---

## 1. Versioning

`packaging/ovirt-web-ui-ng.spec` carries `@PACKAGE_RPM_VERSION@` /
`@PACKAGE_RPM_RELEASE@` / `@PACKAGE_RPM_SUFFIX@` placeholder tokens. CI
stamps a throwaway `0.0.<run>` only to prove the spec builds; `release.yml`
derives the real values from the git tag and uses the same version for the
container tag, so RPM `%{version}` and image tag never drift:

| Tag            | RPM                          | Image tags          |
| -------------- | ---------------------------- | ------------------- |
| `v1.2.0`       | `1.2.0-1.el9`                | `1.2.0`, `latest`   |
| `v1.2.0-rc.1`  | `1.2.0-0.1.rc.1.el9`         | `1.2.0-rc.1`        |

Pre-releases use a `0.1.<pre>` Release so they always sort below the final
`-1` build, and are published as GitHub pre-releases.

The app version shown in the About dialog comes from `app/package.json`
(baked at build time via `__APP_VERSION__`); bump it in the same commit that
gets tagged. `release.yml` fails if the tag and `package.json` disagree.

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

## 4. The release workflow

Cutting a release:

```sh
# bump app/package.json "version" (e.g. 1.2.0), commit, then:
git tag v1.2.0
git push origin v1.2.0
```

If the release fails (CI red, a flaky e2e), nothing was published, so
nothing needs undoing: re-run the failed jobs, or fix the commit and move
the tag to it.

The tag triggers `.github/workflows/release.yml`, which:

1. checks the tag against `app/package.json`,
2. runs the whole of `ci.yml` on the tagged commit — lint, typecheck, unit
   tests, production build, `npm audit`, Playwright e2e, the container build
   and a test rpmbuild. **Nothing below runs unless every CI job passes**, so
   a red commit can be tagged but never published,
3. substitutes the `@PACKAGE_RPM_*@` tokens from the tag and builds the RPM +
   SRPM on AlmaLinux 9 from the exact `dist` CI just tested,
4. builds the container image (`packaging/Containerfile`), pushes it to
   `ghcr.io/skywalkw3r/ovirt-web-ui-ng`, and pushes a provenance attestation
   for its digest to the registry,
5. writes `SHA256SUMS`, attests every file in it, and attaches the RPM, SRPM,
   `ovirt-web-ui-ng-dist-<version>.tar.gz`, `SHA256SUMS` and the provenance
   bundle to the GitHub release (created with generated notes, or added to a
   release made beforehand with `gh release create`).

Verify a download or the image against the build that produced it:

```sh
sha256sum -c SHA256SUMS
gh attestation verify ovirt-web-ui-ng-*.noarch.rpm -R skywalkw3r/ovirt-web-ui-ng
gh attestation verify oci://ghcr.io/skywalkw3r/ovirt-web-ui-ng:1.2.0 -R skywalkw3r/ovirt-web-ui-ng
```

Still manual: GPG-signing the RPM and publishing it to a dnf repo (§2), and
cosign-signing the image (§3). The SRPM on each release is the input Copr
(Option B) needs.
