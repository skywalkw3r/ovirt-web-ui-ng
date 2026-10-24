import { useState, type Ref } from 'react'
import {
  Badge,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { FilterIcon } from '@patternfly/react-icons'
import { useT } from '../../i18n/useT'

export interface ViewOption {
  key: string
  label: string
  // optional second line under the label (why the option exists)
  description?: string
  isSelected: boolean
  onToggle: () => void
  isDisabled?: boolean
}

// Row-level view toggles that are not attribute facets — "hide the engine's
// housekeeping disks" and the like. Same visual grammar as ColumnPicker (an
// icon toggle at the toolbar's right edge opening a checkbox list) so the
// filter strip keeps only the attribute filters webadmin users expect. The
// badge counts active toggles, which is the cue for why a list is shorter
// than the engine's total. Purely presentational: callers own the state.
export function ViewOptionsMenu({ options }: { options: ViewOption[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()
  const active = options.filter((option) => option.isSelected).length

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      shouldFocusToggleOnSelect={false}
      popperProps={{ position: 'right', enableFlip: true }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          aria-label={t('common.viewOptions.ariaLabel')}
          icon={<FilterIcon />}
          badge={active > 0 ? <Badge isRead>{active}</Badge> : undefined}
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
        />
      )}
    >
      <DropdownList>
        {options.map((option) => (
          <DropdownItem
            key={option.key}
            hasCheckbox
            isSelected={option.isSelected}
            isDisabled={option.isDisabled}
            description={option.description}
            onClick={option.onToggle}
          >
            {option.label}
          </DropdownItem>
        ))}
      </DropdownList>
    </Dropdown>
  )
}
