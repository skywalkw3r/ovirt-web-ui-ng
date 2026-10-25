/* oxlint-disable react/only-export-components -- the provider and its hook
   share one private context */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Host } from '../../api/schemas/host'
import { ConfigureLocalStorageModal } from './ConfigureLocalStorageModal'

interface ConfigureLocalStorageLauncher {
  open: (host: Host) => void
}

const ConfigureLocalStorageContext = createContext<ConfigureLocalStorageLauncher | null>(null)

// Hosts the Configure Local Storage dialog (and with it the run's state) once,
// above every list, instead of inside a row's HostActionsMenu. The chain moves
// the host to another cluster midway, so a list scoped to the old cluster or
// data center (Hosts & Clusters panes, a search, a facet) drops the row on its
// next poll; a dialog mounted in that row would unmount mid-run and take the
// step progress, the account of what was left behind and the close gating
// with it. Mounted in AppShell, the dialog stays until the user closes it.
// While one is open, open() for any host keeps the current dialog, so a
// second click on the same host shows the running dialog rather than starting
// another run.
export function ConfigureLocalStorageProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Host | null>(null)
  const open = useCallback((next: Host) => {
    setHost((current) => current ?? next)
  }, [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <ConfigureLocalStorageContext.Provider value={value}>
      {children}
      {host && <ConfigureLocalStorageModal host={host} onClose={() => setHost(null)} />}
    </ConfigureLocalStorageContext.Provider>
  )
}

// null outside the provider (isolated component tests); HostActionsMenu then
// mounts the dialog itself.
export function useConfigureLocalStorageLauncher(): ConfigureLocalStorageLauncher | null {
  return useContext(ConfigureLocalStorageContext)
}
