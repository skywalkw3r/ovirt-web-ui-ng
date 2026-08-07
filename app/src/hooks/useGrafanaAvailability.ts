import { useQuery } from '@tanstack/react-query'
import { useCapabilities } from '../auth/capabilities'
import { useRuntimeConfig } from '../config/runtime'
import { rebase } from '../servers/registry'
import { useSettings } from '../settings/SettingsProvider'
import { ADMIN_RESOURCE_POLL_INTERVAL_MS } from './useAdminResources'

export type GrafanaStatus = 'checking' | 'available' | 'unavailable'

// Same-origin, unauthenticated liveness probe of the oVirt Grafana. Verified
// against a live 4.5 engine: GET /ovirt-engine-grafana/api/health -> 200 JSON
// { commit, database, version }. connect-src 'self' already permits it, so no
// CSP change is needed for the probe. It proves Grafana is REACHABLE, not that
// its panels can be embedded — a deployment with allow_embedding off answers
// health 200 while its iframes are X-Frame-blocked, which is exactly why the UI
// always keeps a manual "Open in Grafana" link (see MonitoringHistory).
async function probe(baseUrl: string, signal: AbortSignal): Promise<boolean> {
  // dev:mock has no real Grafana. Default to unavailable so the graceful
  // fallback is what renders under dev:mock; set localStorage 'mock-grafana' to
  // 'available' to preview the reachable branch.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK === '1') {
    return localStorage.getItem('mock-grafana') === 'available'
  }
  const response = await fetch(`${baseUrl}/api/health`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return false
  // An SPA index.html fallback can answer 200 with HTML; require real JSON.
  const body: unknown = await response.json().catch(() => undefined)
  return typeof body === 'object' && body !== null
}

export interface GrafanaAvailability {
  // whether the historical-monitoring surface should render at all
  visible: boolean
  status: GrafanaStatus
  grafanaBaseUrl: string
  refetch: () => void
}

export function useGrafanaAvailability(): GrafanaAvailability {
  const { monitoring } = useRuntimeConfig()
  const { isAdmin, loaded } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  const mode = monitoring.enabled
  // Gate: deployer switch AND a resolved admin session (DWH/Grafana is
  // admin-oriented). Gating on `loaded` avoids a flash before the profile
  // resolves.
  const gate = mode !== 'off' && loaded && isAdmin
  // Multi-engine: a same-origin Grafana path follows the active engine, so
  // the history surface (and the portal link) belong to the engine this
  // session is signed in to. A deployer-pinned absolute URL passes through.
  const grafanaBaseUrl = rebase(monitoring.grafanaBaseUrl)
  const query = useQuery({
    queryKey: ['grafana', 'health', grafanaBaseUrl],
    queryFn: ({ signal }) => probe(grafanaBaseUrl, signal),
    enabled: gate,
    // A liveness check never needs the VM 10s cadence; floor it at the admin
    // cadence, same convention as useAdminResources.
    refetchInterval: Math.max(refreshIntervalMs, ADMIN_RESOURCE_POLL_INTERVAL_MS),
    staleTime: 30_000,
    // A DWH-less deployment answers a hard failure every time; retrying just
    // delays the fallback state.
    retry: false,
  })
  const status: GrafanaStatus = query.isPending
    ? 'checking'
    : query.data
      ? 'available'
      : 'unavailable'
  // 'on' always renders the surface (an unreachable Grafana shows the
  // unavailable state so a deployer who forced it on sees the failure);
  // 'auto' renders it only once the probe finds a live Grafana, so a DWH-less
  // engine shows nothing rather than a permanent "unavailable" card.
  const visible = gate && (mode === 'on' || status === 'available')
  return {
    visible,
    status,
    grafanaBaseUrl,
    refetch: () => void query.refetch(),
  }
}
