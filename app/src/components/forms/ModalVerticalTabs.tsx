import { useState, type ReactNode } from 'react'
import { Flex, FlexItem, Tab, Tabs, TabTitleText } from '@patternfly/react-core'

export interface ModalTabSection {
  key: string
  title: string
  content: ReactNode
}

// Webadmin-style sectioned modal body: a vertical tab rail on the LEFT with
// the active section's form to its RIGHT. PF6's <Tabs isVertical> only lays
// the tab list out vertically — inline tab children still stack below it —
// so this owns the two-column layout itself and renders the active section
// in the right column. Sections unmount on switch; keep form state in the
// modal (a draft object), not in the sections, which the edit-vm sections
// already do. Every multi-section modal should use this so the layout stays
// consistent (user decision 2026-07-04: left-side tabs like old webadmin).
export function ModalVerticalTabs({
  sections,
  ariaLabel,
  idPrefix,
}: {
  sections: ModalTabSection[]
  ariaLabel: string
  // namespaces the tab/panel ids so two open modals can't collide
  idPrefix: string
}) {
  const [activeKey, setActiveKey] = useState<string | number>(sections[0]?.key ?? '')
  const active = sections.find((section) => section.key === activeKey) ?? sections[0]

  return (
    <Flex
      flexWrap={{ default: 'nowrap' }}
      alignItems={{ default: 'alignItemsStretch' }}
      spaceItems={{ default: 'spaceItemsLg' }}
    >
      <FlexItem style={{ flexShrink: 0 }}>
        <Tabs
          isVertical
          activeKey={activeKey}
          onSelect={(_event, tabKey) => setActiveKey(tabKey)}
          aria-label={ariaLabel}
        >
          {sections.map((section) => (
            <Tab
              key={section.key}
              eventKey={section.key}
              title={<TabTitleText>{section.title}</TabTitleText>}
              id={`${idPrefix}-tab-${section.key}`}
              tabContentId={`${idPrefix}-panel-${section.key}`}
            />
          ))}
        </Tabs>
      </FlexItem>
      <FlexItem flex={{ default: 'flex_1' }}>
        {active && (
          <div
            role="tabpanel"
            id={`${idPrefix}-panel-${active.key}`}
            aria-labelledby={`${idPrefix}-tab-${active.key}`}
          >
            {active.content}
          </div>
        )}
      </FlexItem>
    </Flex>
  )
}
