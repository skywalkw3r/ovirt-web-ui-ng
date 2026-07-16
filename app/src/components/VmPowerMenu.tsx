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
import { VM_ACTION_LABEL_IDS, useVmAction } from '../hooks/useVmActions'
import { useT } from '../i18n/useT'
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
  const t = useT()

  const items = POWER_ACTIONS.filter((item) => item.allowed(vm.status))

  const select = (item: PowerAction) => {
    setIsOpen(false)
    if (item.confirmBodyId) {
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
            {t('power.menu.label')}
          </MenuToggle>
        )}
      >
        <DropdownList>
          {items.map((item) => (
            <DropdownItem
              key={item.action}
              icon={item.icon}
              isDanger={item.isDanger}
              tooltipProps={{ content: t(item.descriptionId), position: 'left' }}
              onClick={() => select(item)}
            >
              {t(VM_ACTION_LABEL_IDS[item.action])}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>

      {confirming && (
        <ConfirmModal
          isOpen
          title={t('vmActions.confirm.title', {
            action: t(VM_ACTION_LABEL_IDS[confirming.action]),
            name: vm.name,
          })}
          body={confirming.confirmBodyId ? t(confirming.confirmBodyId) : undefined}
          confirmLabel={t(VM_ACTION_LABEL_IDS[confirming.action])}
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
