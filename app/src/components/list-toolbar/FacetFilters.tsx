import { useState, type Ref } from 'react'
import {
  Badge,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  ToolbarFilter,
  ToolbarGroup,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { useIntl } from 'react-intl'
import type { FacetOption } from '../../lib/facets'

export interface FacetFilterView {
  key: string
  // already localized by the caller — this component stays presentational,
  // same split as ColumnPicker
  label: string
  options: FacetOption[]
  selected: readonly string[]
}

// One checkbox dropdown per facet, each with its applied values shown as
// removable labels under the toolbar (PF's ToolbarFilter label groups; the
// parent Toolbar supplies clearAllFilters).
//
// All facets render side by side rather than behind PF's attribute-value
// pattern (one "filter by" select that swaps a single value menu): at this
// count the swapping variant hides which filters exist behind two clicks,
// and this toolbar is wide. Facets with nothing to offer drop out entirely,
// so a single-cluster install shows no Cluster menu.
export function FacetFilters({
  facets,
  onToggle,
  onClear,
}: {
  facets: FacetFilterView[]
  onToggle: (key: string, value: string) => void
  onClear: (key: string) => void
}) {
  const shown = facets.filter((facet) => facet.options.length > 0)
  if (shown.length === 0) return null
  return (
    <ToolbarGroup variant="filter-group">
      {shown.map((facet) => (
        <FacetSelect key={facet.key} facet={facet} onToggle={onToggle} onClear={onClear} />
      ))}
    </ToolbarGroup>
  )
}

function FacetSelect({
  facet,
  onToggle,
  onClear,
}: {
  facet: FacetFilterView
  onToggle: (key: string, value: string) => void
  onClear: (key: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const intl = useIntl()
  const labelOf = (value: string) =>
    facet.options.find((option) => option.value === value)?.label ?? value

  return (
    <ToolbarFilter
      categoryName={{ key: facet.key, name: facet.label }}
      // ToolbarLabel objects (not bare strings): the label carries the raw
      // value as its key, so deleting a chip removes the right option even
      // when two facets share a display name
      labels={facet.selected.map((value) => ({ key: value, node: labelOf(value) }))}
      deleteLabel={(_category, label) =>
        onToggle(facet.key, typeof label === 'string' ? label : label.key)
      }
      deleteLabelGroup={() => onClear(facet.key)}
    >
      <Select
        isOpen={isOpen}
        selected={[...facet.selected]}
        // multi-select: the menu deliberately stays open across clicks so a
        // whole set can be picked in one visit (ColumnPicker does the same)
        onSelect={(_event, value) => onToggle(facet.key, String(value))}
        onOpenChange={setIsOpen}
        shouldFocusToggleOnSelect={false}
        // REQUIRED for a checkbox select (PF documents it on the prop): a
        // hasCheckbox option renders role="menuitem", which under the default
        // role="listbox" list is an invalid ARIA parent/child pairing that
        // axe flags. 'menu' makes the pair menu > menuitem.
        role="menu"
        // Cluster and Host run to hundreds of entries on a real engine —
        // scroll the menu rather than let it run off the viewport
        isScrollable
        maxMenuHeight="20rem"
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            badge={
              facet.selected.length > 0 ? <Badge isRead>{facet.selected.length}</Badge> : undefined
            }
          >
            {facet.label}
          </MenuToggle>
        )}
      >
        <SelectList>
          {facet.options.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              hasCheckbox
              isSelected={facet.selected.includes(option.value)}
              isDisabled={option.isDisabled}
            >
              {option.label}{' '}
              {/* what picking this option would leave on screen, given every
                  other facet already applied — inline rather than PF's
                  description slot, which would double every row's height */}
              <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                ({intl.formatNumber(option.count)})
              </span>
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarFilter>
  )
}
