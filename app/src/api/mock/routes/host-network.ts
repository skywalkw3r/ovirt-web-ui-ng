import type { MockRoute } from './types'

// Mock routes for the host and host-network area (LLDP, copy host networks, local storage). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
export const hostNetworkRoutes: MockRoute[] = []
