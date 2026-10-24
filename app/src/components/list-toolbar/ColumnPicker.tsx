import { useState, type Ref } from 'react'
import {
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { ColumnsIcon } from '@patternfly/react-icons'
import { useT } from '../../i18n/useT'

// Webadmin's checkbox column menu, scoped per list page: a columns-icon
// toggle opens a checkbox row per column plus a reset item. Purely
// presentational — the caller (useColumnPrefs) owns visibility state and
// persistence; this component only owns isOpen. The menu deliberately stays
// open while toggling checkboxes (PF6's controlled Dropdown only closes via
// onOpenChange on outside click/Escape, or our own handlers), so multiple
// columns can be flipped in one visit; only Reset closes it.
export function ColumnPicker({
  columns,
  isVisible,
  onToggle,
  onReset,
}: {
  columns: { key: string; label: string; always?: boolean }[]
  isVisible: (key: string) => boolean
  onToggle: (key: string) => void
  onReset: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      // keep focus on the checkbox row after each toggle instead of yanking
      // it back to the toggle button mid-session
      shouldFocusToggleOnSelect={false}
      // the picker lives at the toolbar's right edge: align the menu's right
      // edge to the toggle (dropping leftward) so it never clips off-screen
      popperProps={{ position: 'right', enableFlip: true }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          aria-label={t('common.columns.ariaLabel')}
          icon={<ColumnsIcon />}
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
        />
      )}
    >
      <DropdownList>
        {columns.map((column) => (
          <DropdownItem
            key={column.key}
            hasCheckbox
            isSelected={isVisible(column.key)}
            // always-columns render locked: disabled checkbox, stays checked
            isDisabled={column.always === true}
            description={column.always === true ? t('common.columns.alwaysShown') : undefined}
            onClick={() => onToggle(column.key)}
          >
            {column.label}
          </DropdownItem>
        ))}
        <Divider component="li" key="column-picker-divider" />
        <DropdownItem
          key="reset"
          onClick={() => {
            setIsOpen(false)
            onReset()
          }}
        >
          {t('common.columns.reset')}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  )
}
