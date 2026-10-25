import type { MockRoute } from './types'

// Mock routes for the storage area (discard options, managed block storage). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
export const storageRoutes: MockRoute[] = []
