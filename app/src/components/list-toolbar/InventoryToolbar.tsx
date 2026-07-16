import { Button, Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem } from '@patternfly/react-core'
import { BarsIcon } from '@patternfly/react-icons'
import { InventoryViewSwitcher } from '../InventoryViewSwitcher'
import { RefreshControl } from '../RefreshControl'
import { BookmarkMenu } from './BookmarkMenu'
import { SearchInput } from './SearchInput'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'

// Tier 1 of the two inventory surfaces' toolbar: the controls scoped to the
// PAGE rather than to whichever table is on screen — collapse the tree, filter
// it, refresh the whole view. Both trees render this identically, so those
// controls never move when the admin switches views.
//
// Tier 2 is PaneToolbar (actions + pagination + export + columns), which sits
// above the table it targets. The split is what keeps Hosts & Clusters honest:
// its three panes each own a column-pref area and a row set, so those controls
// belong to the pane, not the page.
export function InventoryToolbar({
  view,
  isTreeOpen,
  onToggleTree,
  treeToggleLabelIds,
  filter,
  onFilterChange,
  bookmarkArea,
  hintId,
  ariaLabelId,
}: {
  view: 'inventory' | 'infra'
  isTreeOpen: boolean
  onToggleTree: () => void
  // each view names its own tree — 'folder tree' vs 'infrastructure tree'
  treeToggleLabelIds: { hide: MessageId; show: MessageId }
  filter: string
  onFilterChange: (value: string) => void
  bookmarkArea: string
  hintId: MessageId
  ariaLabelId: MessageId
}) {
  const t = useT()
  return (
    <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
      <ToolbarContent>
        {/* With the tree collapsed the above-tree switcher would vanish, so it
            rides along here beside the hamburger and never disappears — as a
            segmented control, not the tab strip it wears above the tree (see
            InventoryViewSwitcher on why). */}
        {!isTreeOpen && (
          <ToolbarItem alignSelf="center">
            <InventoryViewSwitcher active={view} variant="toolbar" />
          </ToolbarItem>
        )}
        <ToolbarItem>
          <Button
            variant="plain"
            aria-label={t(isTreeOpen ? treeToggleLabelIds.hide : treeToggleLabelIds.show)}
            icon={<BarsIcon />}
            onClick={onToggleTree}
          />
        </ToolbarItem>
        <ToolbarItem style={{ width: '22rem' }}>
          <SearchInput
            value={filter}
            onChange={onFilterChange}
            onCommit={() => {}}
            hint={t(hintId)}
            ariaLabel={t(ariaLabelId)}
            trailing={
              <BookmarkMenu area={bookmarkArea} currentQuery={filter} onApply={onFilterChange} />
            }
          />
        </ToolbarItem>
        <ToolbarGroup align={{ default: 'alignEnd' }}>
          <ToolbarItem>
            <RefreshControl />
          </ToolbarItem>
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  )
}
