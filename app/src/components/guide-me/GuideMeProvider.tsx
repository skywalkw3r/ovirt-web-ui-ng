import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { ClusterGuideMe } from './ClusterGuideMe'
import { DataCenterGuideMe } from './DataCenterGuideMe'
import { GuideMeContext, type GuideKind, type GuideTarget } from './guideMeContext'

interface GuideProps {
  id: string
  justCreated?: boolean
  onClose: () => void
}

// One guide component per entity kind. Another entity registers here.
const GUIDES: Record<GuideKind, ComponentType<GuideProps>> = {
  dataCenter: DataCenterGuideMe,
  cluster: ClusterGuideMe,
}

// Hosts the Guide Me dialog once, above every list (like
// ConfigureLocalStorageProvider): it opens from short-lived surfaces — a
// right-click menu, a create dialog that unmounts on save — and must outlive
// them. While a guide is open, open() keeps it: a cluster created from the
// data center guide's Configure Cluster step returns to that guide instead of
// replacing it with the new cluster's, as in webadmin.
export function GuideMeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<GuideTarget | null>(null)
  const open = useCallback((next: GuideTarget) => {
    setTarget((current) => current ?? next)
  }, [])
  const value = useMemo(() => ({ open }), [open])
  const Guide = target ? GUIDES[target.kind] : null
  return (
    <GuideMeContext.Provider value={value}>
      {children}
      {target && Guide && (
        <Guide
          key={`${target.kind}-${target.id}`}
          id={target.id}
          justCreated={target.justCreated}
          onClose={() => setTarget(null)}
        />
      )}
    </GuideMeContext.Provider>
  )
}
