// Deploy-time runtime config for the OpenShift deployment — mounted over the
// baked copy by the web-ui-ng Deployment (see kustomization.yaml). Edit in
// Git; the ConfigMap hash change rolls the pods. Full option reference:
// app/public/config.js in the repo.
window.ovirtWebUiConfig = {
  // Multi-engine server list (login-page picker; first entry is the default
  // selection for new browsers). Two kinds of entry:
  //
  //  - url = the console's OWN origin (this Route's host): traffic goes
  //    same-origin through this pod's nginx proxy to ENGINE_ORIGIN
  //    (deployment.yaml). No CORS setup needed for that engine. Use this for
  //    the "default" engine.
  //
  //  - url = an engine's own origin: the browser talks to that engine
  //    DIRECTLY. That engine needs the one-time CORS enablement
  //    (packaging/engine-cors/README.md) and its origin must be added to
  //    CSP_CONNECT_EXTRA in deployment.yaml; users' browsers must trust its
  //    TLS certificate.
  servers: {
    list: [
      { name: 'HE 1 (default)', url: 'https://console.apps.cluster.example.com' },
      { name: 'HE 2', url: 'https://engine2.example.com' },
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
