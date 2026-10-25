// Pure helpers behind the cluster dialog's create-time networking fields
// (General tab: Management Network, Default Network Provider), shared by the
// option-list hooks (hooks/useClusterFormNetworking.ts) and the dialog. Each
// mirrors the engine/webadmin rule it names so the preselection matches what
// webadmin would show.
import type { Cluster } from '../api/schemas/cluster'
import type { Network } from '../api/schemas/network'
import type { Provider } from '../api/schemas/provider'

// The engine-wide DefaultManagementNetwork config value (vdc_options). REST
// does not expose engine config, so the shipped default name is assumed; a
// renamed default only loses the preselection (the admin still picks).
export const DEFAULT_MANAGEMENT_NETWORK_NAME = 'ovirtmgmt'

// The data-center networks a new cluster may use as its management network.
// Mirrors the engine's ManagementNetworkCandidatePredicate (bll network/dc/
// predicate): every DC network except provider-supplied (external) ones.
export function managementNetworkCandidates(networks: Network[]): Network[] {
  return networks.filter((network) => !network.external_provider?.id)
}

// The management network a new cluster gets when none is named, after the
// engine's DefaultManagementNetworkFinderImpl: the config default by name
// (ovirtmgmt), else the only candidate. Takes the CANDIDATE list (what the
// select offers). The engine's last rung (the one network already serving as
// management in some cluster of the DC) needs per-cluster network reads, so
// it is left to the engine: '' omits management_network and the engine runs
// the same finder on add.
export function defaultManagementNetworkId(candidates: Network[]): string {
  const byName = candidates.find((network) => network.name === DEFAULT_MANAGEMENT_NETWORK_NAME)
  if (byName) return byName.id
  return candidates.length === 1 ? candidates[0].id : ''
}

// The Default Network Provider options: webadmin lists the OPENSTACK_NETWORK
// and EXTERNAL_NETWORK provider types (ClusterModel.initDefaultNetworkProvider),
// which REST serves together from /openstacknetworkproviders, the collection
// listProviders tags 'network'.
export function networkProviderOptions(providers: Provider[]): Provider[] {
  return providers.filter((provider) => provider.providerType === 'network')
}

// The cluster's current management network among its attached networks: the
// one the read model's management_network link names, else the one whose
// cluster attachment carries the 'management' usage.
export function findManagementNetwork(
  cluster: Cluster,
  clusterNetworks: Network[],
): Network | undefined {
  const linkedId = cluster.management_network?.id
  return (
    (linkedId ? clusterNetworks.find((network) => network.id === linkedId) : undefined) ??
    clusterNetworks.find((network) => (network.usages?.usage ?? []).includes('management'))
  )
}
