import { clusterRoutes } from './cluster'
import { hostNetworkRoutes } from './host-network'
import { storageRoutes } from './storage'
import type { MockRoute } from './types'
import { vmRoutes } from './vm'

export type { MockRoute } from './types'

// Per-area route modules, so parallel workstreams add mock endpoints without
// all editing the single routes table in handlers.ts.
export const extraRoutes: MockRoute[] = [
  ...vmRoutes,
  ...hostNetworkRoutes,
  ...storageRoutes,
  ...clusterRoutes,
]
