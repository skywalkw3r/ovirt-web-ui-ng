# Security posture & threat model

STRIDE-lite threat model for the modernized oVirt frontend (`app/`). This is a
browser SPA that talks to the oVirt engine's REST/SSO API and console
websocket-proxy. It holds **no server-side state of its own** and stores **no
secrets at rest** — its security posture is therefore mostly about how it
handles the bearer token, what it renders, and what the deployment topology
guarantees.

Companion docs:

- [SECURITY-HEADERS.md](SECURITY-HEADERS.md) — authoritative CSP + response
  header set (the "Controls" section below cross-references it).
- [PLAN.md](PLAN.md) §3.6 — RBAC / capability-tier design (see the residual
  risks below; the live-engine `Filter` work must not violate the "client
  tier is cosmetic" invariant).

Scope: the frontend and its deployment wrapper (`packaging/`). The engine
itself, its SSO server, and the desktop virt-viewer/SPICE client are **trusted
external systems** and out of scope except where we hand them data.

---

## 1. Assets & trust boundaries

| Asset | What it is | Trust boundary |
| --- | --- | --- |
| **The app (SPA bundle)** | Our bundled, content-hashed JS/CSS served same-origin behind the engine's Apache at `/ovirt-engine/web-ui-ng/`. | Runs in the user's browser; fully attacker-observable (it's client code). We trust our own bundle only insofar as CSP `script-src 'self'` keeps injected script out. |
| **The engine REST/SSO API** | `/ovirt-engine/api/*` and the SSO token endpoints, same-origin with the page. | **Trusted external system.** It is the authoritative authZ enforcer (see the `Filter` control). We trust its responses — a compromised engine is out of our threat model, but its *effects* on us are bounded by CSP (see §4). |
| **The SSO bearer token** | Short-lived `Authorization: Bearer` credential for the logged-in user. Either injected by the SSO-authenticated page (`window.userInfo`, prod) or obtained via the login form. | **The crown-jewel secret.** Held in a module-level singleton mirrored to **per-tab `sessionStorage`** (`app/src/api/session.ts`) so a page refresh does not force re-login — a deliberate, documented revision of the original memory-only stance: `sessionStorage` dies with the tab, and an XSS able to enumerate it could equally hook `fetch` and lift the token off the wire, so the exposure delta is negligible. Never in a cookie, `localStorage`, the URL, or the DOM. Crossing it into any of those is a disclosure boundary. |
| **The console proxy** | The engine's websocket-proxy that noVNC (RFB) connects to over `wss:`; may listen on a **different host/port** than the page origin. | Trusted external endpoint. The short-lived console **ticket** (RFB password) is the sensitive item on this path; it is passed only as `credentials.password` and never logged or rendered (`app/src/components/console/NovncConsole.tsx:101`). |
| **The browser** | The rendering + storage environment: DOM, `localStorage` (non-secret settings only), clipboard, download subsystem. | The boundary between our in-memory state and anything durable/observable (screenshots, extensions, session-replay, downloaded files). |

**Deployment boundary.** In production the app is served **same-origin** behind
the engine's Apache (`app/vite.config.ts` `base`). This collapses the
app↔engine boundary onto one origin: there is no CORS surface, and the SSO
session cookie is never sent cross-origin from our pages. In containerized
deploys an nginx reverse proxy sits between the browser and the engine
(`packaging/nginx-sample.conf`) — that nginx→engine hop is its own trust
boundary and is a **known residual risk** (see §4, TLS verification).

---

## 2. Controls in place

Each control with a one-line "why it holds".

| Control | Where | Why it holds |
| --- | --- | --- |
| **Per-tab token store** | `app/src/api/session.ts` (module singleton mirrored to `sessionStorage`); read in `app/src/api/transport.ts` | The token lives in JS memory and a per-tab `sessionStorage` mirror (so a refresh does not force re-login) — no cookie, no `localStorage`, no URL. There is no ambient credential to steal at rest, and nothing survives the tab closing. The mirror is the deliberate revision recorded in §1/§3; see there for why the exposure delta is ~nil. |
| **Same-origin delivery** | `SECURITY-HEADERS.md`; `app/vite.config.ts` `base` | REST, SSO, and (mostly) the console share the page origin, so there is no CORS relaxation to abuse and CSP can stay `default-src 'self'`. |
| **Strict CSP** | `SECURITY-HEADERS.md` (authoritative header) + `app/index.html:37` (`<meta>` subset) | `script-src 'self'` (no `unsafe-inline`/`unsafe-eval`) is the primary XSS mitigation; `connect-src 'self' wss:` (no bare `https:`) denies any slipped-through XSS an exfil channel; `frame-ancestors 'none'` (header-only) blocks clickjacking; `object-src`/`base-uri` locked down. |
| **Bearer-not-cookie CSRF posture** | `app/src/api/transport.ts:52`; `SECURITY-HEADERS.md` §Cookies/CSRF | Auth rides in a custom `Authorization` header a cross-site form cannot forge, and there is no ambient cookie credential, so classic CSRF has nothing to ride. |
| **Server-side `Filter` authZ** | `app/src/api/transport.ts` (`Filter` from `session.ts` `isSessionAdmin`); `app/src/api/resources/consoles.ts` | Result scoping is enforced by the **engine**, keyed on the bearer token's real role. The client sends `Filter:false` only for a server-verified admin (defaults to `true`), but the engine independently rejects `Filter:false` from real non-admins — so a spoofed client flag cannot widen access. A refresh-restored session re-seeds the flag from a per-tab `sessionStorage` hint stored beside the token (same trust decision as persisting the token itself): the hint only replays a tier the engine verified for that token earlier in the tab session, the profile is re-verified on every boot, and a stale hint yields engine-rejected requests plus a corrective wholesale refetch — never widened access. |
| **Secrets never persist beyond the tab** | `session.ts`; console ticket in `NovncConsole.tsx:101` | Neither the bearer token nor the console ticket is logged, serialized to the URL, or written to the DOM. The token reaches only per-tab `sessionStorage` (cleared on sign-out, gone on tab close); the console ticket stays in memory. `localStorage` holds only non-secret, browser-scoped preferences (theme, interval, columns, bookmarks) — which by design survive sign-out. |
| **Sign-out revokes server-side** | `revokeToken` in `app/src/api/auth.ts`; called from `AuthProvider.logout` | Sign-out POSTs the token to the engine's `/ovirt-engine/services/sso-logout` (the token-scoped alias — `/sso/oauth/revoke` authenticates the *client* and a browser has no client secret), and **checks the answer**: oVirt reports SSO faults in the body, sometimes under a 200, so HTTP-ok alone is not evidence. An unconfirmed revoke warns rather than passing silently. Sign-out also broadcasts to sibling tabs (`auth/sessionChannel.ts`), each revoking its own token. |
| **Idle sessions expire server-side** | `app/src/auth/keepalive.ts` + `auth/activity.ts` | The keep-alive pings only while the user is actually active, so an abandoned tab stops resetting the engine's `UserSessionTimeOutInterval` and the engine's own policy ends the session. The client-side idle logout (Preferences → Session timeout) is a courtesy on top, not the only control. |
| **Origin-checked cross-tab token handoff** | responder `app/src/auth/AuthProvider.tsx`; requester `app/src/pages/VmConsolePage.tsx` | The in-browser console opens in its own tab, which may start with no credential (`sessionStorage` is per-tab; some browsers copy it into a `window.open` tab, others don't). It asks its opener for one via `postMessage`; both sides require `event.origin === location.origin`, the reply pins `targetOrigin` to the origin (never `*`), and the opener only ever answers when it already holds a token. So a cross-origin document can neither elicit nor receive the token, and in the console tab it lives in the same per-tab session store (never in `localStorage`, never in the console URL). The `window.open` deliberately keeps `opener` (no `noopener`) for this handshake — safe because it is same-origin. |
| **Dependency audit in CI** | `.github/workflows/*` (dep audit); `scripts/verify-live-engine.mjs` is **not** in CI | Supply-chain drift is caught in CI; the one TLS-relaxing script is gated behind `ENGINE_INSECURE=1` and never runs in CI, so it is not a build-time exposure. |

---

## 3. STRIDE-lite

One row per STRIDE category: the most relevant threat, its mitigation, and the
residual risk that remains after the mitigation.

| Category | Threat | Mitigation | Residual risk |
| --- | --- | --- | --- |
| **Spoofing** | Attacker forges a session or spoofs an admin identity to see admin UI/data. | Auth is a server-issued SSO bearer token; the engine authenticates every request. Client `isAdmin` is a *presentation-only* tier. | The client `isAdmin` heuristic is name-based and spoofable (`app/src/api/resources/users.ts:34`, `username.startsWith('admin')`). **Today it only unlocks cosmetic UI** — admin data requests are still `Filter`-scoped/403'd by the engine — so spoofing it exposes no data. Latent risk if it ever gates a security decision (see §4). |
| **Tampering** | A caller (or future resource module) overrides a security-critical request header, defeating auth or permission scoping. | `transport.ts` sets `Authorization` and `Filter: 'true'` on every request. | `...opts.headers` is spread **last** (`transport.ts:58`), after `Authorization`/`Filter`, so a caller *could* clobber them. **Not attacker-reachable today** — only first-party modules set `opts.headers` and none pass those keys — but it's a defense-in-depth gap; spread caller headers first so security headers win. |
| **Repudiation** | — (the frontend is not the system of record; audit lives in the engine.) | Engine-side audit trails all privileged actions against the authenticated token. | Out of scope for the SPA; no client-side action log is claimed or relied on. |
| **Info disclosure** | The live bearer token leaks into the rendered page and is read by screenshots / extensions / session-replay. | Token is confined to memory + per-tab `sessionStorage` and never intentionally rendered. | **Medium, plausible:** `seedInjectedSession()` (`app/src/auth/AuthProvider.tsx:27`) returns the **token** (not the username) on any *second* invocation, because its idempotency guard returns `getSessionToken()`. Under `<StrictMode>` the happy path is unaffected, but any remount while the module-singleton token is set would seed `username` with the raw token — which is rendered verbatim in the masthead/account modal (`UserMenu.tsx:63,102`). Fix: make the initializer pure, return `readInjectedSession()?.username`, never the token. |
| **DoS** | — (no server-side capacity we own; the engine owns rate/quota.) | Poll hooks read a user-tunable interval and floor infra/admin collections at 30–60s (`CLAUDE.md` §hooks) so the client doesn't hammer the engine. | Client can't meaningfully DoS itself; engine-side quotas are out of scope. Reliability defect (not DoS): the `.vv` download revokes its blob URL synchronously (`app/src/hooks/useConsoles.ts:33`), which can race the download and silently drop the file — defer the revoke. |
| **Elevation of privilege** | A non-admin gets **unscoped, all-tenant data** by influencing the client to drop permission scoping. | `Filter` is `false` only for a session whose admin status came from the engine's own `/permissions` response, and the engine independently rejects `Filter:false` from real non-admins. | **Resolved (was medium/plausible).** `Filter` is now per-request (`transport.ts` ← `session.ts` `isSessionAdmin`), driven off the server-verified capability profile, not a name heuristic. Even a tampered client that forces `isSessionAdmin` → sends `Filter:false` gains nothing: the engine returns an error / still-scoped data for a real non-admin. The engine remains the sole authZ enforcer; the client flag only chooses a *request* the engine must still authorize. |

---

## 4. Known residual risks & non-goals

These are accepted or deferred by design. They are stated so future work
doesn't silently regress them.

- **Client RBAC is cosmetic, not enforcement — by design.** `auth/capabilities.ts`
  / `isAdmin` (`app/src/api/resources/users.ts:34`) only hide nav entries and
  skip "doomed" admin requests as a UX nicety. The code comments frame this
  honestly (`app/src/hooks/useHosts.ts:12`; `HostsPage.tsx:133` deep-link guard
  = "hiding, not enforcement"). **Hard rule:** the client capability tier MUST
  NOT select the `Filter` header value or gate any request the engine does not
  independently authorize. `Filter` defaults to `'true'` and only drops to
  `'false'` under a **server-verified** admin session. (This invariant is
  currently implied by scattered comments; it should be stated once,
  authoritatively, in `SECURITY-HEADERS.md` or PLAN.md §3.6.)

- **XSS via a compromised/hostile engine response is bounded, not eliminated.**
  We trust the engine, but if a response carried attacker-controlled markup,
  `script-src 'self'` (no inline/eval) prevents script execution, and
  `connect-src 'self' wss:` (no bare `https:`) denies any exfil channel.
  `dangerouslySetInnerHTML` is banned (PLAN.md Phase 4). Engine-controlled
  strings that flow to non-web sinks are low-impact and browser-sanitized:
  a VM name flows into the `.vv` `download` filename
  (`src/hooks/useConsoles.ts:43`), but browsers coerce `download` to a safe
  basename, so no traversal/forced-write results (optional hardening: sanitize
  the basename ourselves).

- **The app trusts the engine.** A compromised engine, a compromised SSO
  server, or a MITM on the app↔engine path is **out of scope** for the SPA's
  own threat model — but the deployment must not *introduce* such a MITM:
  the shipped nginx template disables upstream TLS verification
  (`packaging/nginx-sample.conf:102`, `proxy_ssl_verify off`) and is baked into
  the container image as the default (`packaging/Containerfile:40,50`). An
  attacker on the nginx→engine network path could then present any cert and
  read/inject the bearer-token traffic. **This is a low-severity but real
  ship-default gap** — production deploys must set `proxy_ssl_verify on` with
  the engine CA; the relaxed setting should be an explicit lab-only opt-in.

- **The open-redirect check is string-prefix, not allowlist.**
  `redirectTarget()` (`app/src/pages/LoginPage.tsx:27`) blocks `//evil` but not
  backslash/tab/CRLF variants. **Non-exploitable today** because the redirect
  is consumed only by TanStack Router client-side navigation
  (`pushState`/`replaceState`), which cannot go cross-origin — but it becomes
  load-bearing if the value is ever routed through `window.location`. If so,
  validate against an allowlist or `new URL(redirect, origin).origin ===
  location.origin`.

- **Console input is enabled by default** (`NovncConsole.tsx:184`,
  `viewOnly: false`; `shared: true`) — intentional for an interactive admin VM
  console, matching legacy. No remote→local clipboard is auto-exposed
  (`pasteClipboard` is never wired to a paste listener). Not a defect; noted so
  a stricter default (`viewOnly: true` + explicit "Enable input") is a
  conscious future choice, not an accident.

- **Non-goals:** the frontend does not implement its own authZ, audit log,
  rate limiting, or secret storage. All of these are the engine's
  responsibility by design.

---

## 5. Open items for the live-engine phase

To close before/at the live-engine cutover (these are conditional on the real
proxy topology being known):

- [ ] **Pin the CSP `wss:` origin.** `connect-src` currently allows scheme-wide
  `wss:` because the websocket-proxy host/port isn't known at build time
  (`SECURITY-HEADERS.md` §connect-src). Once the proxy origin is fixed, narrow
  `wss:` to that specific `wss://host:port`.
- [ ] **Verify the security response headers are actually emitted.** The
  authoritative CSP + companion headers (`X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, HSTS,
  `Cache-Control: no-store` on `index.html`) must be confirmed on the real
  Apache/nginx response, not just the `<meta>` subset — `frame-ancestors` and
  HSTS exist **only** in the header form. Keep `app/index.html`'s `<meta>` in
  sync when the policy changes.
- [ ] **Fix the `Filter`/RBAC design before wiring admin data paths.** Amend
  PLAN.md §3.6 so `Filter` is chosen from the server-verified role only, and
  replace the name-based `isAdmin` heuristic with the planned
  `GET /users/{id}/permissions` derivation *before* any security-relevant
  consumer is added.
- [ ] **Fix the `seedInjectedSession()` token-in-username defect**
  (`AuthProvider.tsx:27`) before the injected-session path meets a real engine
  where remounts are plausible.
- [ ] **Harden the nginx template default** to `proxy_ssl_verify on` (engine CA
  trusted), with the relaxed setting gated behind an explicit
  `ENGINE_INSECURE`-style toggle.
- [ ] **Set `proxy_ssl_verify off` header spread + download-revoke fixes** as
  low-risk cleanups (transport header ordering; defer `.vv` blob revoke).
- [ ] **Pen-test checklist reference.** Add a report endpoint
  (`report-uri`/`report-to`) to catch CSP violations in the field before a
  public launch, and run an external pen-test pass covering: token-in-DOM
  disclosure, open-redirect via any future `location` sink, console
  ticket/token leakage into logs/telemetry, and the nginx→engine TLS hop.
- [ ] **Confirm the `verify-live-engine.mjs` insecure gate stays opt-in.** It
  can disable Node TLS validation via `NODE_TLS_REJECT_UNAUTHORIZED=0`, gated
  behind `ENGINE_INSECURE=1` and never run in CI (`scripts/verify-live-engine.mjs:50`);
  optionally have it print a loud warning when the gate is on.
