import { ApiError } from '../../transport'
// handlers.ts imports this module (via routes/index) to build its routes table;
// the fixtures below are only read inside handle(), after both modules have
// finished evaluating, so the import cycle is safe.
import { addCluster, clusters, openStackNetworkProviders } from '../handlers'
import type { MockRoute } from './types'

// Each cluster's default network provider id (the engine's
// cluster.default_network_provider_id; at most one per cluster). The Default
// cluster runs ovirt-provider-ovn, as a stock engine install configures it;
// lab-nested has none. addClusterWithNetworking records a mock-created
// cluster's provider here.
const SEED_DEFAULT_NETWORK_PROVIDER: Record<string, string> = {
  'cluster-01': 'onp-01',
}
let clusterDefaultNetworkProvider: Record<string, string> = { ...SEED_DEFAULT_NETWORK_PROVIDER }

// Restores the seeded provider map, dropping links recorded for mock-created
// clusters, so one test's create never leaks into the next.
export function resetClusterRouteMocks(): void {
  clusterDefaultNetworkProvider = { ...SEED_DEFAULT_NETWORK_PROVIDER }
}

// GET /clusters/{id}/externalnetworkproviders: the cluster's default network
// provider as an ExternalProvider list (BackendClusterExternalNetworkProviders
// Resource maps it through OpenStackNetworkProviderMapper). 404 for an unknown
// cluster; a provider deleted from the Providers page simply drops out. The
// password is never served, matching the live engine.
function clusterExternalNetworkProviders(clusterId: string): unknown {
  if (!clusters.some((cluster) => cluster.id === clusterId)) {
    throw new ApiError(404, 'Not Found', `no cluster with id ${clusterId}`)
  }
  const providerId = clusterDefaultNetworkProvider[clusterId]
  const provider = openStackNetworkProviders.find((entry) => entry.id === providerId)
  if (!provider) return {}
  const { password: _password, ...rest } = provider
  return { external_provider: [rest] }
}

// POST /clusters: the core addCluster plus the two create-only networking
// fields it does not carry. management_network rides on the stored detail (the
// live engine links it on every cluster read) and the first provider id lands
// in clusterDefaultNetworkProvider, matching ClusterMapper, which reads only
// the first entry's id.
function addClusterWithNetworking(body: unknown): unknown {
  const created = addCluster(body) as { id: string }
  const spec = (body ?? {}) as {
    management_network?: { id?: string }
    external_network_providers?: { external_provider?: { id?: string }[] }
  }
  const managementNetworkId = spec.management_network?.id
  if (managementNetworkId)
    Object.assign(created, { management_network: { id: managementNetworkId } })
  const providerId = spec.external_network_providers?.external_provider?.[0]?.id
  if (providerId) clusterDefaultNetworkProvider[created.id] = providerId
  return created
}

// Mock routes for the cluster area (create-time networks, CPU type warnings). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
export const clusterRoutes: MockRoute[] = [
  {
    method: 'POST',
    pattern: /^\/clusters$/,
    handle: (_params, body) => addClusterWithNetworking(body),
  },
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/externalnetworkproviders$/,
    handle: ([id]) => clusterExternalNetworkProviders(id),
  },
]
