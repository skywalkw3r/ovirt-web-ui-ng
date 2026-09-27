// Deploy-time runtime config for the OpenShift deployment — mounted over the
// baked copy by the web-ui-ng Deployment (see kustomization.yaml). Edit in
// Git; the ConfigMap hash change rolls the pods. Full option reference:
// app/public/config.js in the repo.
window.ovirtWebUiConfig = {
  // Multi-engine server list (login-page picker; first entry is the default
  // selection for new browsers). Three kinds of entry:
  //
  //  - url = '/e/<slug>' — RECOMMENDED. A same-origin path prefix that this
  //    pod's nginx proxies to the engine (one `location /e/<slug>/` block per
  //    engine in the mounted default.conf — see README.md). Everything stays
  //    on the console's origin: no CORS, no CSP_CONNECT_EXTRA, and browsers
  //    trust only the console's certificate. `fqdn` names the engine in the
  //    masthead tooltip; `wan: true` marks a high-latency engine so the app
  //    starts light against it.
  //
  //  - url = the console's OWN origin (this Route's host): the single-engine
  //    shape — traffic goes same-origin through the baked nginx-sample.conf to
  //    ENGINE_ORIGIN (deployment.yaml). No CORS; needs the engine-ca mount.
  //
  //  - url = an engine's own https:// origin: the browser talks to that engine
  //    DIRECTLY. It needs the one-time CORS enablement (engine-config
  //    CORSSupport/CORSAllowedOrigins for the API + a CORS-fixed enginesso
  //    build for SSO), its origin added to CSP_CONNECT_EXTRA in
  //    deployment.yaml, and a TLS certificate users' browsers trust. Keep it
  //    for engines you cannot front with a proxy path.
  servers: {
    list: [
      { name: 'HE 1', url: '/e/he1', fqdn: 'engine1.example.com' },
      { name: 'HE 2', url: '/e/he2', fqdn: 'engine2.example.com' },
      { name: 'HE 3 — remote site', url: '/e/he3', fqdn: 'engine3.example.com', wan: true },
      // Direct-connect alternative (per-engine CORS + CSP_CONNECT_EXTRA):
      // { name: 'HE 4', url: 'https://engine4.example.com' },
    ],
  },

  // Truly-global login-screen notice: shown pre-auth to every user on every
  // engine, straight from this file (no sign-in / cache / admin role needed).
  // Distinct from the per-engine Platform Settings sign-in notice. Omit to hide.
  login: {
    notice: 'Authorized use only. Activity is monitored.',
  },

  monitoring: {
    grafanaBaseUrl: '/ovirt-engine-grafana',
  },
}
