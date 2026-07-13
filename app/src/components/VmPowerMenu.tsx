import { useState, type Ref } from 'react'
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { PowerOffIcon } from '@patternfly/react-icons'
import type { Vm } from '../api/schemas/vm'
import { VM_ACTION_LABELS, useVmAction } from '../hooks/useVmActions'
import { ConfirmModal } from './ConfirmModal'
import { POWER_ACTIONS, type PowerAction } from './vm-power-actions'

// The detail header's single power button (webadmin's Run/Suspend/Shutdown/
// Reboot buttons collapsed into one dropdown). Items whose status predicate
// fails are hidden; a transitional status (no action applies) degrades to a
// disabled toggle so the header keeps its shape.
export function VmPowerMenu({ vm }: { vm: Vm }) {
  const [isOpen, setIsOpen] = useState(false)
  const [confirming, setConfirming] = useState<PowerAction | null>(null)
  const mutation = useVmAction()

  const items = POWER_ACTIONS.filter((item) => item.allowed(vm.status))

  const select = (item: PowerAction) => {
    setIsOpen(false)
    if (item.confirmBody) {
      setConfirming(item)
    } else {
      mutation.mutate({ vm, action: item.action })
    }
  }

  return (
    <>
      <Dropdown
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        // Right-align to the toggle end (house convention for right-side
        // menus) so the menu stays on-screen in the detail-page header.
        popperProps={{ position: 'right', enableFlip: true }}
        toggle={(toggleRef: Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            variant="secondary"
            icon={<PowerOffIcon />}
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            isDisabled={items.length === 0 || mutation.isPending}
          >
            Power
          </MenuToggle>
        )}
      >
        <DropdownList>
          {items.map((item) => (
            <DropdownItem
              key={item.action}
              icon={item.icon}
              isDanger={item.isDanger}
              tooltipProps={{ content: item.description, position: 'left' }}
              onClick={() => select(item)}
            >
              {VM_ACTION_LABELS[item.action]}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>

      {confirming && (
        <ConfirmModal
          isOpen
          title={`${VM_ACTION_LABELS[confirming.action]} ${vm.name}?`}
          body={confirming.confirmBody}
          confirmLabel={VM_ACTION_LABELS[confirming.action]}
          onConfirm={() => {
            setConfirming(null)
            mutation.mutate({ vm, action: confirming.action })
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  )
}
