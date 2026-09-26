import { useState } from 'react'
import { useTreeOpen } from '../../hooks/useTreeOpen'
import { parseNodeId, type InfraSelection, type PaneTabKey } from './infraModel'

// The navigator's own state: which node is selected (remembered for the
// session), the client-side name filter, whether the tree panel is open, and
// which browse tab the content pane shows. Page-owned rather than tree-owned
// because the panes it drives unmount on every tab switch.

// session-scoped view memory for the tree selection (see selectedId below)
const INFRA_SELECTED_KEY = 'console-infra-selected'

export interface InfraTreeState {
  selectedId: string | null
  // the selected node, parsed — null at the root (or for nothing selected)
  selection: InfraSelection | null
  setSelectedId: (id: string | null) => void
  // client-side tree name filter (hosts/clusters/DCs) — bookmarkable
  filter: string
  setFilter: (value: string) => void
  // the trimmed, lower-cased filter; '' = everything
  needle: string
  isTreeOpen: boolean
  toggleTree: () => void
  // the tabs this selection offers, outermost first
  paneTabs: ReadonlyArray<PaneTabKey>
  activePaneTab: PaneTabKey
  setPaneTab: (tab: PaneTabKey) => void
}

export function useInfraTreeState(): InfraTreeState {
  // Session-scoped view memory: the selected node survives leaving the view so
  // switching to VMs & Templates and back lands where the admin left off. A
  // stale id resolves to no entity and falls back to the all-VMs pane, so
  // nodes removed between visits degrade safely.
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    const stored = sessionStorage.getItem(INFRA_SELECTED_KEY)
    return stored !== null && parseNodeId(stored) !== null ? stored : null
  })
  const setSelectedId = (id: string | null) => {
    setSelectedIdState(id)
    if (id === null) sessionStorage.removeItem(INFRA_SELECTED_KEY)
    else sessionStorage.setItem(INFRA_SELECTED_KEY, id)
  }

  const [filter, setFilter] = useState('')
  // Shared area key with VMs & Templates: the two inventory views are one
  // surface, so a collapsed tree stays collapsed across the view switcher.
  const [isTreeOpen, toggleTree] = useTreeOpen('inventory')

  // The selected node drives the content pane (resolved to entities by
  // useInfraInventory). Parsed here so the pane tabs can key off the kind.
  const selection = selectedId === null ? null : parseNodeId(selectedId)

  // Browse tabs at EVERY layer (webadmin's per-level subtabs), scoped to the
  // selection and ordered outermost-first. Each rung drops the tab it is now
  // inside of: the root lists Data centers, a DC is already one so it starts at
  // Clusters, a cluster starts at Hosts, and a host is a leaf with only VMs.
  // The active tab defaults to the leftmost available and clamps back to it
  // whenever the current tab leaves the set (e.g. leaving the root's Data
  // centers tab for a host).
  const [paneTab, setPaneTab] = useState<PaneTabKey>('datacenters')
  const paneTabs: ReadonlyArray<PaneTabKey> =
    selection?.kind === 'host'
      ? ['vms']
      : selection?.kind === 'cluster'
        ? ['hosts', 'vms']
        : selection?.kind === 'datacenter'
          ? ['clusters', 'hosts', 'vms']
          : ['datacenters', 'clusters', 'hosts', 'vms']
  const activePaneTab = paneTabs.includes(paneTab) ? paneTab : paneTabs[0]

  return {
    selectedId,
    selection,
    setSelectedId,
    filter,
    setFilter,
    needle: filter.trim().toLowerCase(),
    isTreeOpen,
    toggleTree,
    paneTabs,
    activePaneTab,
    setPaneTab,
  }
}
