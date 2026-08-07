import { getActiveServer, rebase } from '../servers/registry'

// Where the masthead engine badge links: the ENGINE's own welcome page, which
// fans out to the Administration Portal, the VM Portal and the rest of the
// engine-served UIs. The welcome page (not webadmin directly) so the link never
// dead-ends on a permission fault for a user-tier session.
//
// Same origin hazard as the Grafana link (lib/monitoringPortal.ts): the engine
// UI is served by the ENGINE, so a bare relative '/ovirt-engine/' resolved
// against the page origin lands on the CONSOLE host — on a proxy/OpenShift
// deploy that is the route (…apps.<cluster>/ovirt-engine/), which serves no
// engine UI. Resolution order:
//   1. the active engine's configured `fqdn` makes it absolute —
//      https://<fqdn>/ovirt-engine/, i.e. the hosted engine itself
//      (config.js servers[].fqdn — see config/runtime.ts);
//   2. else rebase onto the active base — correct for the integrated
//      same-origin deploy (the console IS the engine) and for a `base` that is
//      already the engine's own origin.
// The '/e/<slug>' path-proxy base only reaches the engine UI when the proxy
// maps more than the API, which is exactly why those entries carry an `fqdn`.
export function engineWebUiUrl(): string {
  const fqdn = getActiveServer()?.fqdn?.trim()
  if (fqdn) return `https://${fqdn}/ovirt-engine/`
  return rebase('/ovirt-engine/')
}
