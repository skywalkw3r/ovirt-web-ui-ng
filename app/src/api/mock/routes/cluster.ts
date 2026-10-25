import type { MockRoute } from './types'

// Mock routes for the cluster area (create-time networks, CPU type warnings). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
export const clusterRoutes: MockRoute[] = []
