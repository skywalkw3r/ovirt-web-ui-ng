import { ApiError } from '../../transport'
// handlers.ts imports this module (via routes/index) to build its routes table;
// the fixtures below are only read inside handle(), after both modules have
// finished evaluating, so the import cycle is safe.
import { clusters, openStackNetworkProviders } from '../handlers'
import type { MockRoute } from './types'

// Each cluster's default network provider id (the engine's
// cluster.default_network_provider_id; at most one per cluster). The Default
// cluster runs ovirt-provider-ovn, as a stock engine install configures it;
// lab-nested has none. The core POST /clusters handler does not record
// external_network_providers, so a mock-created cluster reads back with none.
const clusterDefaultNetworkProvider: Record<string, string> = {
  'cluster-01': 'onp-01',
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

// Mock routes for the cluster area (create-time networks, CPU type warnings). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
export const clusterRoutes: MockRoute[] = [
  {
    method: 'GET',
    pattern: /^\/clusters\/([^/]+)\/externalnetworkproviders$/,
    handle: ([id]) => clusterExternalNetworkProviders(id),
  },
]
