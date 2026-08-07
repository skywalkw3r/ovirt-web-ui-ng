import { Dropdown, DropdownItem, DropdownList, TabTitleText } from '@patternfly/react-core'
import { CaretDownIcon } from '@patternfly/react-icons'
import { useState } from 'react'

export interface MoreTabEntry {
  eventKey: string
  title: string
}

/**
 * Overflow-style "More" entry for a PF Tabs strip. Render it as the LAST
 * child of <Tabs>: PF drops any valid element straight into the tablist <ul>,
 * so this mirrors PF's own OverflowTab markup (li.pf-v6-c-tabs__item >
 * button.pf-v6-c-tabs__link[role=tab]). When one of its tabs is active the
 * <li> carries pf-m-current, which Tabs' setAccentStyles() measures to slide
 * the animated active-tab underline under this toggle — no custom styling.
 * Tabs never generates a TabContent for this element (it has no JSX
 * children), so the host page owns rendering of the selected panel.
 */
export function MoreTabsMenu({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: readonly MoreTabEntry[]
  activeKey: string | number
  onSelect: (eventKey: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const activeTab = tabs.find((tab) => tab.eventKey === activeKey)

  return (
    <li className={`pf-v6-c-tabs__item${activeTab ? ' pf-m-current' : ''}`} role="presentation">
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        onSelect={() => setIsOpen(false)}
        shouldFocusFirstItemOnOpen
        shouldFocusToggleOnSelect
        toggle={(toggleRef) => (
          <button
            ref={toggleRef}
            type="button"
            role="tab"
            className={`pf-v6-c-tabs__link${isOpen ? ' pf-m-expanded' : ''}`}
            aria-label="More tabs"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-selected={Boolean(activeTab)}
            onClick={() => setIsOpen(!isOpen)}
          >
            <TabTitleText>{activeTab?.title ?? 'More'}</TabTitleText>
            <span className="pf-v6-c-tabs__link-toggle-icon">
              <CaretDownIcon />
            </span>
          </button>
        )}
      >
        <DropdownList>
          {tabs.map((tab) => (
            <DropdownItem
              key={tab.eventKey}
              isSelected={tab.eventKey === activeKey}
              onClick={() => onSelect(tab.eventKey)}
            >
              {tab.title}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>
    </li>
  )
}
