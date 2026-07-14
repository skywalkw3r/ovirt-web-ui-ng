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
  //      mapping, OR the Apache drop-in from packaging/engine-cors/ installed
  //      on the engine host.
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
  // servers: {
  //   list: [
  //     { name: 'HE 1 (local)', url: 'https://engine1.example.com', fqdn: 'engine1.example.com' },
  //     { name: 'HE 2 — lab',  url: '/e/lab', fqdn: 'engine2.example.com' },
  //   ],
  // },

  // Monitoring tab: live utilization always works; this block controls the
  // Global login-screen notice, shown pre-auth to every user on every engine
  // — reads straight from this file on the first visit (no sign-in, no
  // per-browser cache, no admin role needed). This is the truly-global banner;
  // the per-engine Platform Settings > "sign-in notice" is separate and only
  // reaches the login page after an authenticated visit in that browser.
  // Plain text; whitespace/newlines are preserved. Omit or '' to hide.
  //
  // login: {
  //   notice: 'Authorized use only. Activity is monitored.',
  // },

  // Grafana / Data-Warehouse HISTORY charts (admin-gated).
  //
  // ZERO-CONFIG DEFAULT: the app probes {grafanaBaseUrl}/api/health and shows
  // history automatically when ovirt-engine-grafana (with the Data Warehouse)
  // is installed — on a stock engine you don't need to touch this file. Charts
  // are drawn natively from Grafana's query API; users sign in to Grafana once
  // (the UI prompts them) and the charts appear.
  monitoring: {
    // Force the history surface on/off instead of auto-detecting:
    //   enabled: false,  // hide everywhere, never probe
    //   enabled: true,   // always show; an unreachable Grafana renders an
    //                    // "unavailable" state instead of hiding
    // (leave unset for auto-detection)

    // Grafana base (same-origin path behind the engine's Apache). Default:
    grafanaBaseUrl: '/ovirt-engine-grafana',

    // Which dashboard panels feed the native history charts, per entity. The
    // app fetches the dashboard definition at runtime and reuses its SQL,
    // template-variable defaults, and datasource — so panel edits in Grafana
    // are picked up automatically. `idVar` names the dashboard variable that
    // carries the entity GUID (defaults: vm_id / host_id / cluster_id).
    //
    // vm defaults to the stock oVirt 4.5 VM dashboard (shown below) — only
    // set it to override. host/cluster are OFF until configured here; verify
    // the UID, panel ids, and idVar against YOUR Grafana before enabling
    // (stock candidates: HostDashboard / ClusterDashboard — check the
    // dashboard URL and its variables in Grafana).
    queries: {
      // vm: {
      //   dashboardUid: 'VirtualMachineDashboard',
      //   panelIds: [7, 8, 18, 14, 20, 19, 33, 21, 40],
      //   idVar: 'vm_id',
      // },
      // host: { dashboardUid: 'HostDashboard', panelIds: [/* … */], idVar: 'host_id' },
      // cluster: { dashboardUid: 'ClusterDashboard', panelIds: [/* … */], idVar: 'cluster_id' },
    },
  },
}
