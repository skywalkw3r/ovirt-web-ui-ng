import type { MockRoute } from './types'

// Mock routes for the VM area (watchdogs, vNIC network filter parameters). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
export const vmRoutes: MockRoute[] = []
