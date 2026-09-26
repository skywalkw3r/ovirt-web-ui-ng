import type { MouseEvent as ReactMouseEvent } from 'react'
import { TreeView, type TreeViewDataItem } from '@patternfly/react-core'
import { InventoryTreeSidebar } from '../../components/InventoryTreeSidebar'
import { InventoryViewSwitcher } from '../../components/InventoryViewSwitcher'
import { useT } from '../../i18n/useT'
import { ROOT_ID } from './infraModel'

// The navigator column: the inventory-view tab strip pinned full-width atop
// the tree, matching the VMs & Templates view. The wrapping div's
// onContextMenu is the tree-wide right-click delegation (see the handler in
// the page component).
export function InfraTreePanel({
  treeData,
  filtering,
  selectedId,
  onSelect,
  onTreeContextMenu,
}: {
  treeData: TreeViewDataItem[]
  // true while a search filter is active — drives the collapse-when-idle,
  // expand-while-searching remount of the tree below
  filtering: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onTreeContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const t = useT()
  return (
    <InventoryTreeSidebar>
      <div style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
        <InventoryViewSwitcher active="infra" fill />
      </div>
      <div onContextMenu={onTreeContextMenu}>
        <TreeView
          // Remount on the idle↔filtering transition so PF re-reads
          // defaultExpanded — an uncontrolled TreeView otherwise caches each
          // node's expand state, leaving collapsed folders shut during a search.
          key={filtering ? 'filtering' : 'idle'}
          aria-label={t('infra.tree.ariaLabel')}
          data={treeData}
          hasSelectableNodes
          activeItems={[{ id: selectedId ?? ROOT_ID, name: null }]}
          onSelect={(_event, item) => {
            onSelect(item.id === undefined || item.id === ROOT_ID ? null : item.id)
          }}
        />
      </div>
    </InventoryTreeSidebar>
  )
}
