# ovirt-web-ui-ng.spec
#
# RPM spec for the *next-gen* VM Portal: a Vite static build (React 19 + TS)
# that is served by the engine's Apache at a same-origin sub-path. Unlike the
# legacy portal (legacy/ovirt-web-ui.spec.in) this is NOT a JBoss/WildFly WAR
# deployment -- there is no servlet, no SSO servlet filter chain, no .jsp. The
# engine's own SSO login page performs the OAuth dance and, on redirect back to
# our app, a bootstrap script injects window.userInfo (ssoToken, userName, ...).
# Our SPA reads that global at boot (src/auth/bootstrap.ts), so all we ship is
# static HTML/JS/CSS plus an Apache alias that maps the sub-path to our files.
#
# ASSUMPTIONS (documented, verify at cutover -- see docs/LIVE-ENGINE-CHECKLIST.md):
#   * The engine serves us under /ovirt-engine/web-ui-ng/ (matches the Vite
#     `base` in app/vite.config.ts and VITE_BASE). Change BASE_PATH below AND
#     the Vite base together if this ever moves.
#   * The engine's Apache honours drop-in conf files in
#     %%{_sysconfdir}/ovirt-engine/aaa/ ... no; Apache aliases for the engine live
#     under the ovirt-engine-ui-extensions / ovirt-engine http conf. We install
#     an Alias drop-in under the engine's httpd conf.d so httpd serves our dist
#     without a Java redeploy. The exact include dir is engine-version specific;
#     see the %files note.
#   * The build is produced ahead of time (pre-bundled) exactly like the legacy
#     spec's pre-resolved-deps model: `npm ci && npm run build` in app/ yields
#     app/dist/. This spec expects that dist/ to be present in the source tree
#     (the tarball is built from a tree that already ran the build), OR it runs
#     the build itself when node/npm are available (build_from_source switch below).

%global         product oVirt
%global         appname ovirt-web-ui-ng
# Sub-path the engine's Apache serves us from; MUST match app/vite.config.ts base.
%global         base_path web-ui-ng
%global         web_root %{_datarootdir}/ovirt-engine/%{appname}
# httpd drop-in dir used by ovirt-engine's Apache instance.
%global         httpd_conf_d %{_sysconfdir}/httpd/conf.d
%define         debug_package %{nil}

# build-from-source switch `build_from_source`
#   - OFF by default (0): the tarball already contains a pre-built app/dist
#     (mirrors the legacy pre-bundled model, keeps the build host toolchain-free)
#   - turn ON with `--define 'build_from_source 1'` to run `npm ci && npm run
#     build` during %build (requires the nodejs + npm BuildRequires below)
# A plain global default -- deliberately NOT a bcond/bcond_with macro. Those are
# unreliable across rpm versions on the EL9 builder (bcond_with mis-delegates to
# a ternary bcond and errors "macro expansion did not return an integer"). The
# conditional-global form below parses identically on every rpm.
%{!?build_from_source: %global build_from_source 0}

Name:           %{appname}
Version:        @PACKAGE_RPM_VERSION@
Release:        @PACKAGE_RPM_RELEASE@@PACKAGE_RPM_SUFFIX@%{?checkout}%{?dist}
Summary:        Next-generation VM Portal for %{product}
License:        ASL 2.0
URL:            https://github.com/oVirt/ovirt-web-ui
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch

%if %{build_from_source}
BuildRequires:  nodejs >= 20.19
BuildRequires:  npm >= 10
%endif

# Runtime: the engine provides Apache (httpd) + the REST API + SSO. We only add
# static files and an Alias; we do not pull the engine in as a hard dep so the
# package can be staged, but it is useless without it -- hence the note.
Requires:       httpd
# Recommends rather than Requires so a build/staging box can install the RPM
# without dragging in the whole engine; the deploy target obviously needs it.
Recommends:     ovirt-engine

%description
This package provides the next-generation VM Portal for %{product}: a
single-page React application served as static assets by the engine's Apache
at %{_datarootdir}/../%{base_path}. It reuses the engine's existing SSO session
(token injected via window.userInfo) and calls the same-origin
/ovirt-engine/api REST endpoints. It runs alongside -- and does not replace --
the GWT Administration Portal.

%prep
%setup -q -n %{name}-%{version}

%build
%if %{build_from_source}
# Reproducible install from the committed lockfile, then a production build.
# VITE_BASE pins the served sub-path so asset URLs are absolute under it.
pushd app
npm ci
VITE_BASE=/ovirt-engine/%{base_path}/ npm run build
popd
%else
# Pre-bundled model: verify the expected build output is present in the tarball.
test -f app/dist/index.html || { \
  echo "ERROR: app/dist/index.html missing. Build with 'npm run build' first" >&2; \
  echo "       or rebuild the RPM with --define 'build_from_source 1'." >&2; \
  exit 1; }
%endif

%install
# 1) Static SPA -> engine web root.
install -d -m 0755 %{buildroot}%{web_root}
cp -a app/dist/. %{buildroot}%{web_root}/

# 2) Apache Alias drop-in so httpd serves /ovirt-engine/web-ui-ng/ from disk.
#    Named zz-* so it loads AFTER the engine's z-ovirt-engine-proxy.conf and its
#    `ProxyPass !` wins the merge to exclude our sub-path from the AJP proxy.
install -d -m 0755 %{buildroot}%{httpd_conf_d}
install -p -m 0644 packaging/ovirt-web-ui-ng.conf \
    %{buildroot}%{httpd_conf_d}/zz-%{appname}.conf

%files
%license LICENSE
%doc app/README.md packaging/README.md
%dir %{web_root}
%{web_root}
# config.js carries deploy-time runtime config (window.ovirtWebUiConfig, e.g. the
# Monitoring/Grafana settings). Exclude it from the recursive listing above, then
# re-add it as %config(noreplace) so an admin's edits survive package upgrades.
%exclude %{web_root}/config.js
%config(noreplace) %{web_root}/config.js
# Marked (noreplace) so an admin's local header/CSP tweaks survive upgrades.
%config(noreplace) %{httpd_conf_d}/zz-%{appname}.conf

%post
# Reload the engine's Apache so the new Alias/headers take effect. Best-effort:
# the httpd unit name matches the engine's Apache; a full engine restart via
# engine-setup is the supported path, this is the fast-path for asset-only bumps.
if [ $1 -ge 1 ]; then
    /bin/systemctl reload httpd.service >/dev/null 2>&1 || :
fi

%postun
if [ $1 -eq 0 ]; then
    /bin/systemctl reload httpd.service >/dev/null 2>&1 || :
fi

%changelog
* Thu Jul 02 2026 Skywalker <lw123@protonmail.com> - 0.1.0-1
- Initial packaging of the next-gen (Vite/React 19) VM Portal
- Static-asset deploy under /ovirt-engine/web-ui-ng/ via httpd Alias
- No WAR/servlet: reuses engine SSO via injected window.userInfo token
