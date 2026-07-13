import { useQuery } from '@tanstack/react-query'
import { fetchDashboard, queryDwhPanels, type DwhDashboard } from '../api/grafana-query'
import { useCapabilities } from '../auth/capabilities'
import { useRuntimeConfig, type QueryEntity } from '../config/runtime'
import { rebase } from '../servers/registry'
import { useSettings } from '../settings/SettingsProvider'
import { ADMIN_RESOURCE_POLL_INTERVAL_MS } from './useAdminResources'

export type HistoryRange = '6h' | '24h' | '7d'

// The datasource uid oVirt provisions for the DWH — the fallback when the
// dashboard definition doesn't resolve one (see parseDashboard).
const FALLBACK_DATASOURCE_UID = 'DS_OVIRT_DWH'

// The dashboard definition (panel SQL, variable defaults, datasource) is
// static, so fetch it once per (base, uid, ids) and only re-run the data
// queries on each poll.
const dashboardCache = new Map<string, Promise<DwhDashboard>>()

// Native DWH history for one entity: read the configured dashboard's panel SQL
// once, then batch-query the DWH via Grafana's /api/ds/query on the admin poll
// cadence, substituting the entity GUID for the spec's idVar template variable.
// Returns one chart per panel (see api/grafana-query.ts).
export function useDwhHistory(entity: QueryEntity, entityId: string, range: HistoryRange) {
  const { monitoring } = useRuntimeConfig()
  const { isAdmin, loaded } = useCapabilities()
  const { refreshIntervalMs } = useSettings()
  const spec = monitoring.queries[entity]
  const enabled = spec !== undefined && monitoring.enabled !== 'off' && loaded && isAdmin

  const query = useQuery({
    queryKey: ['dwh', entity, entityId, range, spec?.dashboardUid, spec?.panelIds],
    enabled,
    refetchInterval: Math.max(refreshIntervalMs, ADMIN_RESOURCE_POLL_INTERVAL_MS),
    // A 401 here means "no grafana_session yet" — the user signs in to Grafana
    // in another tab and comes back, so returning focus retries immediately.
    refetchOnWindowFocus: 'always',
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!spec) return []
      // multi-engine: a same-origin Grafana path follows the active engine
      const base = rebase(monitoring.grafanaBaseUrl)
      const cacheKey = `${base}|${spec.dashboardUid}|${spec.panelIds.join(',')}`
      let dashboardPromise = dashboardCache.get(cacheKey)
      if (!dashboardPromise) {
        // no signal: cached across polls, so it must not be tied to one request
        dashboardPromise = fetchDashboard(base, spec.dashboardUid, spec.panelIds)
        dashboardCache.set(cacheKey, dashboardPromise)
      }
      let dashboard: DwhDashboard
      try {
        dashboard = await dashboardPromise
      } catch (error) {
        dashboardCache.delete(cacheKey) // don't cache a failed fetch
        throw error
      }
      return queryDwhPanels(
        base,
        dashboard.datasourceUid ?? FALLBACK_DATASOURCE_UID,
        dashboard.panels,
        { ...dashboard.vars, [spec.idVar]: entityId },
        `now-${range}`,
        'now',
        signal,
      )
    },
  })

  return { enabled, query }
}
