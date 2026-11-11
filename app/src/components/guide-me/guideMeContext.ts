import { createContext, useContext } from 'react'

// The entities that have a Guide Me. Adding one means a plan function in
// guidePlan.ts, a guide component, and an entry in GuideMeProvider's registry.
export type GuideKind = 'dataCenter' | 'cluster'

export interface GuideTarget {
  kind: GuideKind
  id: string
  // opened straight after the entity was created (webadmin's post-create
  // guide): the dialog says so and offers "Configure later"
  justCreated?: boolean
}

export interface GuideMeLauncher {
  open: (target: GuideTarget) => void
}

// Kept apart from GuideMeProvider so the create dialogs can open a guide
// without importing the guides (which import those dialogs back).
export const GuideMeContext = createContext<GuideMeLauncher | null>(null)

// null outside the provider (isolated component tests): callers then hide
// their Guide Me entry and skip the post-create guide.
export function useGuideMeLauncher(): GuideMeLauncher | null {
  return useContext(GuideMeContext)
}
