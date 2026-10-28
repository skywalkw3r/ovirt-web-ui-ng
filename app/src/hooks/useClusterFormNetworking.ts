import { useQuery } from '@tanstack/react-query'
import { listClusterExternalNetworkProviders, listClusterNetworks } from '../api/resources/clusters'
import { listDataCenterNetworks } from '../api/resources/datacenters'
import { listProviders } from '../api/resources/providers'
import { managementNetworkCandidates, networkProviderOptions } from '../lib/clusterNetworking'
import { clusterKeys, dataCenterKeys } from './useAdminResources'
import { providerKeys } from './useParityResources'

// Query-key builder for the one cluster slice this module owns. It nests under
// the ['cluster', id] prefix, so a wholesale cluster invalidation reaches it.
export const clusterNetworkingKeys = {
  externalNetworkProviders: (id: string | undefined) =>
    ['cluster', id, 'externalNetworkProviders'] as const,
}

// The cluster dialog's create-time networking reads (Management Network,
// Default Network Provider) and their edit-time read-only echoes. Each runs
// only while the dialog is open in the matching mode; none polls, because a
// dialog reads its option lists once per open. The keys are the ones the data
// center Networks tab, the Providers page and the cluster Networks tab use, so
// an entry they already fetched serves the dialog without a second request.

// Create: the selected data center's management-network candidates (external
// networks filtered out, as the engine's candidate predicate does).
export function useManagementNetworkOptions(dataCenterId: string, enabled: boolean) {
  return useQuery({
    queryKey: dataCenterKeys.networks(dataCenterId),
    queryFn: () => listDataCenterNetworks(dataCenterId),
    enabled: enabled && dataCenterId !== '',
    select: managementNetworkCandidates,
  })
}

// Create: the network-type external providers (openstack/external network).
export function useNetworkProviderOptions(enabled: boolean) {
  return useQuery({
    queryKey: providerKeys.all,
    queryFn: () => listProviders(),
    enabled,
    select: networkProviderOptions,
  })
}

// Edit: the networks attached to the cluster, from which the current
// management network's name is resolved.
export function useClusterNetworksForForm(clusterId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: clusterKeys.networks(clusterId ?? ''),
    queryFn: () => listClusterNetworks(clusterId ?? ''),
    enabled: enabled && clusterId !== undefined,
  })
}

// Edit: the cluster's default network provider (zero or one entry).
export function useClusterExternalNetworkProviders(
  clusterId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: clusterNetworkingKeys.externalNetworkProviders(clusterId),
    queryFn: () => listClusterExternalNetworkProviders(clusterId ?? ''),
    enabled: enabled && clusterId !== undefined,
  })
}
