// Deployment configuration for the oVirt web-ui-ng, read at boot by
// src/config/runtime.ts (which validates it). Edit this file ON THE SERVER to
// tune optional features WITHOUT rebuilding the app. It is intentionally
// NOT content-hashed, is served no-cache, and is marked %config(noreplace) so
// package upgrades keep your edits.
window.ovirtWebUiConfig = {
  // Multi-engine: list the oVirt/OLVM engines this console may connect to.
  // When any servers are listed, the login page shows a Server picker (the
  // last-used choice is remembered per browser); when the list is absent or
  // empty the console connects to the engine it was served from, exactly as
  // before.
  //
  // ONLY honored by proxy/external builds (the container image sets
  // VITE_MULTI_ENGINE=1 at build time). The integrated RPM on a hosted
  // engine does not compile the capability in — this block is ignored there
  // by design, an engine-host install is always single-engine.
  //
  // Requirements for EACH listed engine that is not the console's own origin:
  //   1. REST API CORS:  engine-config -s CORSSupport=true \
  //                      -s CORSAllowedOrigins=https://<this-console-origin>
  //      (then systemctl restart ovirt-engine)
  //   2. SSO login CORS: an engine build with the fixed enginesso CORS
  //      mapping — or skip CORS entirely by fronting the engine with a
  //      same-origin '/e/<slug>' proxy path instead (the preferred model).
  //   3. The CSP connect-src served with THIS app must include the engine's
  //      origin (see docs/SECURITY-HEADERS.md "Multi-engine deployments").
  //   4. Users' browsers must trust the engine's TLS certificate.
  //
  // URLs: absolute https origin of the engine, OR a '/e/<slug>' same-origin
  // proxy path when the console reverse-proxies its engines (any path on an
  // absolute origin is ignored — the /ovirt-engine/* paths are fixed).
  //
  // `fqdn` (optional): the Hosted Engine's fully-qualified hostname, shown in
  // the masthead badge tooltip so operators see which engine the session
  // targets. Omit it and the tooltip falls back to the console-side URL (which,
  // for a '/e/<slug>' proxy entry, is just the console's own origin + path).
  //
  // `wan` (optional): mark an engine reached over a high-latency WAN link
  // (relative to where this console runs). The app then starts light against
  // it — the VM list never requests inlined statistics (Uptime shows a dash),
  // the hosts read skips its heaviest shape, and VM polling floors at 30s —
  // instead of discovering the slow link through request timeouts first.
  // Purely a performance profile; leave it off for engines on the local LAN.
  //
  // servers: {
  //   list: [
  //     { name: 'HE 1 (local)', url: 'https://engine1.example.com', fqdn: 'engine1.example.com' },
  //     { name: 'HE 2 — lab',  url: '/e/lab', fqdn: 'engine2.example.com' },
  //     { name: 'HE 3 — remote site', url: '/e/remote', fqdn: 'engine3.example.com', wan: true },
  //   ],
  // },

  // Login-screen notice, shown pre-auth to every user on every engine — reads
  // straight from this file on the first visit (no sign-in, no per-browser
  // cache, no admin role needed). Plain text; whitespace/newlines are
  // preserved. Omit or '' to hide.
  //
  // login: {
  //   notice: 'Authorized use only. Activity is monitored.',
  // },

  // Announcement banner ("message of the day"), pinned above the page content
  // for every signed-in user of this console. Shown as soon as `title` or
  // `message` is non-empty — omit the block, or blank both fields, to hide it.
  // Users can dismiss it for their current session; editing the text here
  // brings it back for everyone (the dismissal remembers the exact wording),
  // as does the next sign-in.
  //
  // `severity` tints the banner: 'info' (default), 'warning' or 'danger'.
  // Both fields are plain text — `title` is the bold line, `message` the body;
  // either may stand alone.
  //
  // motd: {
  //   severity: 'warning',
  //   title: 'Maintenance window Saturday 02:00–04:00 UTC',
  //   message: 'Hosts will be moved into maintenance one at a time. Running VMs migrate live.',
  // },

  // Support link added to the masthead user menu (opens in a new tab). Point
  // it at your help desk / ticket queue / runbook. Must be an absolute http(s)
  // URL — anything else is ignored and the menu entry stays hidden, which is
  // also what an omitted or empty value does.
  //
  // support: {
  //   url: 'https://support.example.com/virtualization',
  // },

  // Host console: the "Host console" action on every host (list kebab,
  // right-click menu, host detail header button) opens the host's Cockpit web console
  // in a new browser tab. By default that is https://<host address>:9090 and
  // the administrator signs in to Cockpit with an account on the host. See
  // docs/HOST-CONSOLE.md.
  //
  // `enabled: false` hides every host console entry point.
  // `port` changes the Cockpit port (default 9090).
  // `ssoUrl` turns on single sign-on through the legacy ovirt-cockpit-sso
  // service (oVirt 4.2/4.3 engines; normally https://<engine-fqdn>:9986).
  // The console then opens <ssoUrl>/=<host id>/<ssoPage> and hands the
  // signed-in session token to that service, so it must be an https origin
  // you operate. On a multi-engine deploy set `cockpitSsoUrl` on each engine
  // in servers.list instead (a token is only valid on its own engine).
  // `ssoPage` is the Cockpit page the SSO link lands on (default 'machines').
  //
  // cockpit: {
  //   enabled: true,
  //   port: 9090,
  //   ssoUrl: 'https://engine.example.com:9986',
  // },

  // UI plugins (docs/PLUGINS.md): ES modules that add pages, detail subtabs,
  // VM/host actions and dashboard cards. Off unless `enabled` is true, and
  // ONLY the plugins listed here load. A plugin runs inside the admin's
  // session: list only code you have reviewed or trust.
  //
  // `manifest`: 'plugins/<name>/manifest.json' (under this console's path,
  // the recommended layout: no CSP change), '/path/manifest.json' (from the
  // origin root) or an absolute https:// URL (needs CORS on that server and
  // the origin in the CSP script-src AND connect-src, see
  // docs/SECURITY-HEADERS.md "UI plugins").
  // `servers` (optional, multi-engine): load only for these engines (names
  // from servers.list above).
  // Remove an entry and reload to remove the plugin. User menu → About lists
  // what loaded and what failed.
  //
  // plugins: {
  //   enabled: true,
  //   list: [
  //     { name: 'acme-backup', manifest: 'plugins/acme-backup/manifest.json' },
  //   ],
  // },

  // Monitoring Portal: the admin links (sidebar and Monitoring tabs) that open
  // the engine's bundled Grafana / Data Warehouse dashboards in a new tab.
  // Live utilization on the Dashboard and the Monitoring tabs comes from the
  // engine REST API and needs nothing here.
  //
  // On a multi-engine deploy the link opens https://<servers.list[].fqdn>
  // plus grafanaBaseUrl, so set `fqdn` on each engine entry above.
  monitoring: {
    // Hide every Monitoring Portal link (default: shown to admins):
    //   enabled: false,

    // Grafana base: a path on the engine (default) or an absolute http(s) URL
    // for a standalone Grafana.
    grafanaBaseUrl: '/ovirt-engine-grafana',
  },
}
