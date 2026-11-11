import { Button, Divider, DropdownItem } from '@patternfly/react-core'
import type { EntityActionKind } from './api'
import { useExtensionActions } from './useExtensionActions'

type EntityData = { id: string; name?: string | null } & object

// Plugin items for an entity's actions menu (placement 'kebab'). Render it
// inside the menu's <DropdownList>; it brings its own leading divider and
// renders nothing when no plugin contributes. `onSelect` closes the menu.
export function ExtensionMenuItems({
  kind,
  entity,
  onSelect,
}: {
  kind: EntityActionKind
  entity: EntityData
  onSelect: () => void
}) {
  const actions = useExtensionActions(kind, entity, 'kebab')
  if (actions.length === 0) return null
  return (
    <>
      <Divider component="li" />
      {actions.map((action) => (
        <DropdownItem
          key={action.key}
          isDisabled={action.isDisabled}
          onClick={() => {
            onSelect()
            action.run()
          }}
        >
          {action.label}
        </DropdownItem>
      ))}
    </>
  )
}

// Plugin buttons for a detail page header (placement 'header'), rendered
// before the page's own kebab.
export function ExtensionHeaderActions({
  kind,
  entity,
}: {
  kind: EntityActionKind
  entity: EntityData
}) {
  const actions = useExtensionActions(kind, entity, 'header')
  return actions.map((action) => (
    <Button
      key={action.key}
      variant="secondary"
      isDisabled={action.isDisabled}
      onClick={action.run}
    >
      {action.label}
    </Button>
  ))
}
