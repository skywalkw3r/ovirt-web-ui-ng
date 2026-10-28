import { describe, expect, it } from 'vitest'
import { clusterKeys } from './useAdminResources'
import { clusterNetworkingKeys } from './useClusterFormNetworking'

describe('clusterNetworkingKeys', () => {
  it('nests the default-provider read under the cluster detail prefix', () => {
    const key = clusterNetworkingKeys.externalNetworkProviders('c1')
    expect(key).toEqual(['cluster', 'c1', 'externalNetworkProviders'])
    // a wholesale ['cluster', id] invalidation reaches it
    expect(key.slice(0, 2)).toEqual(clusterKeys.detail('c1'))
  })
})
