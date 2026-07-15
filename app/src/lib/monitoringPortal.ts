import { getRuntimeConfig } from '../config/runtime'
import { getActiveServer, rebase } from '../servers/registry'

// Where the "Monitoring portal" link opens. Grafana is served by the ENGINE, not
// by this console, so a bare relative '/ovirt-engine-grafana' resolved against
// the page origin lands on the CONSOLE host — on a proxy/OpenShift deploy that
// is the route (…apps.<cluster>/ovirt-engine-grafana), which serves no Grafana
// at all. Resolution order:
//   1. an absolute grafanaBaseUrl from config.js wins verbatim (a deployer
//      pointing at a standalone/consolidated Grafana);
//   2. else the active engine's configured `fqdn` makes it absolute —
//      https://<fqdn>/ovirt-engine-grafana, i.e. the hosted engine that
//      actually serves it (config.js servers[].fqdn — see config/runtime.ts);
//   3. else rebase onto the active base — the integrated same-origin deploy
//      where the console IS the engine, and the pre-multi-engine behavior.
// The path form only ever leaves this console when (2) resolves, so a
// single-engine RPM install is unaffected.
export function monitoringPortalUrl(): string {
  const base = getRuntimeConfig().monitoring.grafanaBaseUrl
  if (/^https?:\/\//i.test(base)) return base
  const fqdn = getActiveServer()?.fqdn?.trim()
  if (fqdn) return `https://${fqdn}${base.startsWith('/') ? base : `/${base}`}`
  return rebase(base)
}
