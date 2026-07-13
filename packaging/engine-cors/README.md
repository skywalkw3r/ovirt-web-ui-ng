# Enabling an engine for multi-engine (cross-origin) console access

When ovirt-web-ui-ng is served from origin A and connects to an engine at
origin B (the `servers` list in `config.js`), the browser requires engine B
to answer CORS headers on **two** surfaces. Each engine you list needs this
one-time enablement; engines never listed need nothing.

## 1. REST API — built into the engine

On the engine host:

```sh
engine-config -s CORSSupport=true \
              -s CORSAllowedOrigins=https://console.example.com
systemctl restart ovirt-engine
```

Multiple consoles: comma-separate the origins. This switch is upstream oVirt
and covers `/ovirt-engine/api/*` only.

## 2. SSO login endpoints — one of the following

**a. A fixed engine build.** Upstream's enginesso registers its CORS filter
under a url-pattern that never matches (`/sso/*` inside the
`/ovirt-engine/sso` context), so `CORSSupport=true` silently does nothing for
login. Engine builds carrying the one-line web.xml fix (url-pattern
`/oauth/*`) make the switch in step 1 govern SSO too — nothing more to do.

**b. The Apache drop-in (stock engines).** Copy
[`ovirt-sso-cors.conf`](ovirt-sso-cors.conf) to the engine host:

```sh
cp ovirt-sso-cors.conf /etc/httpd/conf.d/99-ovirt-sso-cors.conf
# edit the SetEnvIfNoCase line: your console origin(s), regex-escaped
apachectl configtest && systemctl reload httpd
```

Remove the file and reload to disable. The drop-in touches only
`/ovirt-engine/sso/oauth/*` and emits headers only for the origins you list.

## 3. Console-side checklist (for completeness)

- The engine's origin is in `config.js` → `servers.list` where the console is
  deployed.
- The CSP `connect-src` served with the console includes the engine's origin
  (see `docs/SECURITY-HEADERS.md` — "Multi-engine deployments").
- Users' browsers trust the engine's TLS certificate (import the engine CA
  once, same as for its admin portal).

## Verifying

From a browser devtools console on the deployed UI's origin:

```js
// preflight + POST both succeed when everything is wired:
fetch('https://engine.example.com/ovirt-engine/sso/oauth/token' +
      '?grant_type=urn:ovirt:params:oauth:grant-type:http&scope=ovirt-app-api',
      { headers: { Accept: 'application/json', Authorization: 'Basic ' + btoa('user@internalsso:pass') } })
  .then(r => r.json()).then(console.log)
```

A CORS error mentioning the *preflight* means step 2 is missing; a CORS error
on the *actual request* usually means the origin list doesn't match exactly
(scheme, host, and port must all match, no trailing slash).
