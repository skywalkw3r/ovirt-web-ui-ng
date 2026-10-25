import { clusterRoutes, resetClusterRouteMocks } from './cluster'
import { hostNetworkRoutes } from './host-network'
import { storageRoutes } from './storage'
import type { MockRoute } from './types'
import { resetVmRouteMocks, vmRoutes } from './vm'

export type { MockRoute } from './types'

// Per-area route modules, so parallel workstreams add mock endpoints without
// all editing the single routes table in handlers.ts.
export const extraRoutes: MockRoute[] = [
  ...vmRoutes,
  ...hostNetworkRoutes,
  ...storageRoutes,
  ...clusterRoutes,
]

// Restores every area module's mutable mock state; test/mockState calls it
// between tests alongside resetMockVms.
export function resetAreaRouteMocks(): void {
  resetClusterRouteMocks()
  resetVmRouteMocks()
}
