# Security response headers

The production build is served **same-origin** behind the engine's Apache at
`/ovirt-engine/web-ui-ng/` (see `app/vite.config.ts` `base`). Same-origin
delivery is itself a security decision: every REST call
(`/ovirt-engine/api/*`), the SSO endpoints, and the console websocket-proxy
share the page origin, so there is no CORS surface and the CSP can keep a
tight `default-src 'self'`.

This document is the **authoritative** security-header set. Apache (or
whatever fronts the app) MUST emit these as real response headers on the
`web-ui-ng` document(s). `app/index.html` also carries a `<meta>` CSP as
defense in depth, but a `<meta>` tag cannot express every directive (notably
`frame-ancestors`), so the header form below is the one that must be
deployed — the meta is a redundant subset, not a substitute.

## Content-Security-Policy

```
Content-Security-Policy: default-src 'self'; connect-src 'self' wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
```

| Directive         | Value                    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default-src`     | `'self'`                 | Fallback for every fetch directive. The app is served same-origin behind the engine, so assets, fonts, workers, and anything not otherwise listed are same-origin. Deny-by-default posture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `connect-src`     | `'self' wss:`            | XHR/fetch to the REST API and SSO are same-origin (`'self'`). `wss:` is required for the in-browser noVNC console, which opens a WebSocket to the engine's **websocket-proxy** — that proxy may listen on a different host/port than the page origin, so it can't be covered by `'self'` alone. **No bare `https:`:** the console (RFB) only ever opens a `wss:` socket, never an `https:` fetch, so a scheme-wide `https:` source buys nothing functionally while handing any XSS (should one slip past `script-src 'self'`) an unrestricted exfiltration channel to any host on the internet. Scheme-only `wss:` (not `*`) keeps this as tight as the proxy topology allows. |
| `img-src`         | `'self' data:`           | OS/status icons come from the API (same-origin). `data:` covers inline data-URI images that PatternFly and Victory emit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `style-src`       | `'self' 'unsafe-inline'` | **`'unsafe-inline'` is a deliberate, scoped exception:** PatternFly 6 and Victory (charts) set inline `style` attributes at runtime for layout, theming, and animation. Without it, tables mis-lay-out and charts fail to render. The risk `'unsafe-inline'` reintroduces is inline-style injection; it is confined to `style-src` only — **scripts do not get it** (`script-src` stays strict), so this does not open an XSS vector, only a CSS-injection one, which is low-severity given no user-controlled markup is rendered (`dangerouslySetInnerHTML` is banned, see PLAN.md Phase 4). Revisit if PF ships nonce/hash-friendly styling.                                 |
| `script-src`      | `'self'`                 | Only our bundled, same-origin JS runs. No `'unsafe-inline'`, no `'unsafe-eval'`. This is the primary XSS mitigation. If a future dep needs eval, treat it as a red flag, not a CSP loosening.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `frame-ancestors` | `'none'`                 | Clickjacking defense — forbids embedding the UI in any `<frame>`/`<iframe>`. **Header-only:** the CSP spec ignores `frame-ancestors` when delivered via `<meta>`, so this directive exists ONLY in the response header. This is the main reason the header form is authoritative. (Supersedes the legacy `X-Frame-Options: DENY`; ship both if legacy-browser support is required.)                                                                                                                                                                                                                                                                                            |
| `base-uri`        | `'self'`                 | Prevents an injected `<base>` tag from re-pointing every relative URL (including script/asset loads) at an attacker origin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `object-src`      | `'none'`                 | No `<object>`/`<embed>`/plugins — legacy plugin content is an unnecessary attack surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### What is NOT in the CSP (and why)

- No `frame-src` — the app frames **nothing**. The Monitoring tab's history
  charts call the same-origin Grafana query API over `connect-src 'self'`
  (`api/grafana-query.ts`) and render natively; the earlier same-origin Grafana
  iframe embed was removed in favor of that path. The SPICE `.vv` handoff
  downloads rather than framing. Reintroducing any frame would need `frame-src`
  back **plus** a security review.
- No `font-src` — PF fonts are bundled and same-origin, covered by
  `default-src`.
- No `report-uri`/`report-to` — add a reporting endpoint before a public
  launch to catch violations in the field.

### Meta-tag CSP (in `index.html`)

The `<meta http-equiv="Content-Security-Policy">` in `app/index.html` carries
the **same policy minus `frame-ancestors`** (meta cannot express it). It is a
belt-and-suspenders measure for environments that might strip the response
header; the response header remains mandatory. Keep the two in sync when
either changes.

## Multi-engine deployments (`config.js` → `servers`)

Multi-engine is a **build-time capability gated to proxy/external
deployments**: only builds with `VITE_MULTI_ENGINE=1` (the Containerfile sets
it) honor a configured server list. The integrated RPM ships the default
build with the capability compiled out — an engine-host install is
single-engine by design, keeps the strict policy above verbatim, and ignores
any `servers` block placed in its `config.js`.

When a capable (container/OpenShift) deployment lists external engines (see
`app/public/config.js`), the browser must be allowed to fetch them, so
`connect-src` gains **exactly those origins** — enumerated, never a bare
`https:`:

```
connect-src 'self' wss: https://engine2.example.com https://engine3.example.com
```

Where the extra origins come from, per deploy path:

- **Container / OpenShift**: set `CSP_CONNECT_EXTRA` (space-separated
  origins). It is substituted into the nginx response header **and**, via
  `sub_filter` over a build-time placeholder, into the baked `<meta>` CSP —
  header and meta cannot drift. Empty (default) is byte-identical to the
  strict policy above.
- **Source builds**: the `<meta>` interpolates `%VITE_CSP_CONNECT_EXTRA%`
  (defaulted to empty in `vite.config.ts`); set it at build time (together
  with `VITE_MULTI_ENGINE=1`) when the serving config's header is also
  widened.
- **RPM / engine-Apache**: not applicable — the integrated build has no
  multi-engine capability, so its CSP never carries foreign origins.

The policy remains deny-by-default: only deployer-listed engine origins are
reachable, users cannot add servers in the browser (config-file-only list,
`config/runtime.ts`), and single-engine deployments keep `connect-src 'self'
wss:` untouched. CSRF posture is unchanged — cross-origin calls still carry
only the Bearer header (no cookies), and each engine independently gates
callers via `CORSAllowedOrigins` (see `packaging/engine-cors/README.md`).

## Companion headers (also set at Apache)

These are not CSP but belong in the same server config and complete the
hardening posture:

| Header                            | Value                                 | Why                                                                                                                                                                         |
| --------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Content-Type-Options`          | `nosniff`                             | Stop MIME sniffing — a `.js`/`.json` response is never re-interpreted as HTML.                                                                                              |
| `Referrer-Policy`                 | `no-referrer`                         | The engine URL can carry sensitive path/query info; don't leak it on outbound navigation.                                                                                   |
| `X-Frame-Options`                 | `DENY`                                | Legacy-browser fallback for `frame-ancestors 'none'`; harmless where CSP is honored.                                                                                        |
| `Strict-Transport-Security`       | `max-age=31536000; includeSubDomains` | The engine is HTTPS-only; pin clients to TLS. Set only once you're confident every sub-path is HTTPS (it is, behind the engine).                                            |
| `Cache-Control` (on `index.html`) | `no-store`                            | The document is tiny and references content-hashed assets; never serve a stale shell that points at deleted chunks. Hashed `/assets/*` are separately long-cache-immutable. |

## Cookies / CSRF

API calls are **Bearer-token** (`Authorization` header), which are inherently
CSRF-safe — a cross-site form can't forge a custom header. The token lives in
memory only (never a cookie), so there is no ambient credential for CSRF to
abuse and no `SameSite` cookie policy to reason about for our own calls. The
engine's own SSO session cookie is out of our scope; the same-origin
deployment means it is never sent cross-origin from our pages. See PLAN.md
Phase 4 for the full token-lifecycle threat model.

## Deployment note

Vite bakes the `base` (`/ovirt-engine/web-ui-ng/`) into the built
`index.html`: `<script>`/`<link>` hrefs and the `import.meta.env.BASE_URL`
constant all resolve under the sub-path. Apache must (a) serve the built
assets under that path, (b) SPA-fallback unknown sub-paths to `index.html`
(TanStack Router handles client routing), and (c) attach the headers above.
The RPM/Apache wiring cribs from `legacy/packaging/` +
`legacy/ovirt-web-ui.spec.in` (which mount the legacy WAR at
`/ovirt-engine/web-ui`); `web-ui-ng` is the parallel mount point so both can
be installed during cutover.
