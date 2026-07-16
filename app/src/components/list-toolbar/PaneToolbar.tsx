import type { ReactNode } from 'react'
import {
  Button,
  Pagination,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { DownloadIcon } from '@patternfly/react-icons'
import { ColumnPicker } from './ColumnPicker'
import type { ColumnPrefs } from '../../hooks/useColumnPrefs'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'

// Page sizes every inventory table offers.
const PER_PAGE_OPTIONS = [
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
]

export interface PaneToolbarPagination {
  itemCount: number
  page: number
  perPage: number
  onSetPage: (page: number) => void
  onPerPageSelect: (perPage: number, page: number) => void
  ariaLabelId: MessageId
}

// Tier 2 of the inventory toolbar (tier 1 is InventoryToolbar): the controls
// that belong to ONE table — the entry points that create its rows, its
// pagination, its export, its column picker. It renders directly above that
// table, so a tabbed pane gives each tab its own set instead of one page-level
// picker silently retargeting on every tab switch.
//
// Every slot renders unconditionally, including while rows load and when the
// table is empty. The fixed slots are the whole point: they are what hold the
// two views' buttons on the same line and stop controls from hopping as the
// selection, tab or load state changes. Export disables itself on an empty
// table rather than disappearing.
export function PaneToolbar({
  actions,
  bulk,
  pagination,
  onExportCsv,
  columns,
  prefs,
}: {
  // create/import entry points for THIS table's rows — omitted where a pane
  // has none (the scoped-VM pane on Hosts & Clusters)
  actions?: ReactNode
  // selection count + Clear, left of the actions (VMs & Templates only)
  bulk?: ReactNode
  pagination: PaneToolbarPagination
  onExportCsv: () => void
  columns: { key: string; label: string; always?: boolean }[]
  prefs: ColumnPrefs
}) {
  const t = useT()
  return (
    <Toolbar style={{ paddingBlockStart: 0, paddingBottom: 'var(--pf-t--global--spacer--sm)' }}>
      <ToolbarContent>
        {bulk}
        {actions !== undefined && <ToolbarGroup>{actions}</ToolbarGroup>}
        <ToolbarGroup align={{ default: 'alignEnd' }}>
          <ToolbarItem variant="pagination">
            <Pagination
              isCompact
              variant="top"
              itemCount={pagination.itemCount}
              page={pagination.page}
              perPage={pagination.perPage}
              perPageOptions={PER_PAGE_OPTIONS}
              onSetPage={(_event, next) => pagination.onSetPage(next)}
              onPerPageSelect={(_event, nextPerPage, nextPage) =>
                pagination.onPerPageSelect(nextPerPage, nextPage)
              }
              titles={{ paginationAriaLabel: t(pagination.ariaLabelId) }}
            />
          </ToolbarItem>
          <ToolbarItem>
            <Button
              variant="link"
              icon={<DownloadIcon />}
              onClick={onExportCsv}
              isDisabled={pagination.itemCount === 0}
            >
              {t('action.exportCsv')}
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <ColumnPicker
              columns={columns}
              isVisible={prefs.isVisible}
              onToggle={prefs.toggle}
              onReset={prefs.reset}
            />
          </ToolbarItem>
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  )
}
