import { useEffect, useState, type Ref } from 'react'
import {
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  FormGroup,
  MenuToggle,
  Stack,
  StackItem,
  TextInput,
  type MenuToggleElement,
} from '@patternfly/react-core'
import {
  EllipsisVIcon,
  ExportIcon,
  FolderIcon,
  PencilAltIcon,
  TrashIcon,
  VirtualMachineIcon,
} from '@patternfly/react-icons'
import type { Template } from '../../api/schemas/template'
import { useCapabilities } from '../../auth/capabilities'
import { useT } from '../../i18n/useT'
import { statusText } from '../../lib/format'
import { useDeleteTemplate } from '../../hooks/useTemplateMutations'
import { ConfirmModal } from '../ConfirmModal'
import { ContextMenu, type ContextMenuPosition } from '../context-menu/ContextMenu'
import { MoveToFolderModal } from '../tags/MoveToFolderModal'
import { TemplateExportModal } from '../template-form/TemplateExportModal'
import { TemplateFormModal } from '../template-form/TemplateFormModal'
import { CreateVmWizardModal } from '../vm-create/CreateVmWizard'

// The Blank system template (the all-zero id on a live engine, name 'Blank' in
// the mock fixtures) is the engine's built-in template: it cannot be removed and
// has no disks to export — the kebab disables both actions for it. Mirrors
// TemplateDetailPage's isBlankTemplate guard.
const BLANK_TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'
function isBlankTemplate(template: Template): boolean {
  return template.id === BLANK_TEMPLATE_ID || template.name === 'Blank'
}

// The shared template row-actions kebab — the template analogue of
// VmActionsMenu. Carries its Edit / Export / Remove modals and their guards
// with it so any list surface can drop it into an actions cell. Export needs
// disks and an unlocked template, and the Blank template can be neither removed
// nor exported — those items stay visible but aria-disabled with the reason in a
// tooltip (webadmin's discoverable-but-blocked pattern) rather than vanishing.
// Remove reuses the detail page's typed-name ConfirmModal + Blank guard.
//
// includeMoveToFolder folds the folder picker into the same kebab (the combined
// VMs & Templates view needs one kebab per row, not two); it is admin-tier only,
// mirroring VmActionsMenu's Move to folder. includeCreateVm folds the preseeded
// Create-VM wizard into the same kebab as its top item, so the combined view
// needs one control per row instead of a standalone button + kebab (the flat
// TemplatesPage keeps its visible button, so it defaults false). The modals
// render as siblings of the Dropdown (held in component state), so closing the
// menu never unmounts them.
//
// contextMenu switches the shell: undefined renders today's kebab untouched;
// set (right-click mode), the SAME DropdownList mounts already open inside a
// cursor-anchored <ContextMenu> at position. Items, gating, order, and the
// sibling modals are identical either way.
export function TemplateActionsMenu({
  template,
  includeMoveToFolder = false,
  includeCreateVm = false,
  contextMenu,
}: {
  template: Template
  includeMoveToFolder?: boolean
  includeCreateVm?: boolean
  contextMenu?: { position: ContextMenuPosition; onClose: () => void }
}) {
  // context mode mounts open at the cursor; kebab mode waits for its toggle
  const [isOpen, setIsOpen] = useState(contextMenu !== undefined)
  const [isEditing, setIsEditing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isCreatingVm, setIsCreatingVm] = useState(false)
  // non-null while the remove confirm is up; holds the typed-name gate
  const [removing, setRemoving] = useState<{ nameInput: string } | null>(null)
  const remove = useDeleteTemplate()
  const t = useT()
  // Folder management is admin-tier only — user tier never sees the item.
  const { isAdmin } = useCapabilities()

  // Context-mode full dismissal: the popup closing (item click, Escape,
  // click-away) must not unmount this component while one of its sibling
  // modals is up or the delete mutation is in flight — the wizard/edit/export/
  // move/remove dialogs live here, and useDeleteTemplate's toasts fire from
  // its useMutation callbacks, which are lost if the component unmounts before
  // the response lands (mock latency is 300ms). Only when the menu is closed
  // AND nothing this component owns is active does the host's onClose run
  // (unmounting via the page's target state).
  useEffect(() => {
    if (contextMenu === undefined || isOpen) return
    if (isEditing || isExporting || isMoveOpen || isCreatingVm || removing !== null) return
    if (remove.isPending) return
    contextMenu.onClose()
  }, [
    contextMenu,
    isOpen,
    isEditing,
    isExporting,
    isMoveOpen,
    isCreatingVm,
    removing,
    remove.isPending,
  ])

  const blank = isBlankTemplate(template)
  const exportLocked = template.status === 'locked' || template.status === 'illegal'
  const exportReason = blank
    ? t('templates.export.blankReason')
    : exportLocked
      ? t('templates.export.lockedReason', { status: statusText(template.status ?? 'unknown') })
      : undefined

  // Both shells render this one element — same items, RBAC gating, and order —
  // so right-click parity with the kebab can never drift.
  const menuItems = (
    <DropdownList>
      {includeCreateVm && (
        <DropdownItem
          icon={<VirtualMachineIcon />}
          onClick={() => {
            setIsOpen(false)
            setIsCreatingVm(true)
          }}
        >
          {t('templates.createVm')}
        </DropdownItem>
      )}
      <DropdownItem
        icon={<PencilAltIcon />}
        onClick={() => {
          setIsOpen(false)
          setIsEditing(true)
        }}
      >
        {t('common.action.edit')}
      </DropdownItem>
      {exportReason !== undefined ? (
        // isAriaDisabled (not isDisabled) keeps the item hoverable so the
        // tooltip shows and it greys out. Same pattern as VmActionsMenu.
        <DropdownItem icon={<ExportIcon />} isAriaDisabled tooltipProps={{ content: exportReason }}>
          {t('templates.action.exportOva')}
        </DropdownItem>
      ) : (
        <DropdownItem
          icon={<ExportIcon />}
          onClick={() => {
            setIsOpen(false)
            setIsExporting(true)
          }}
        >
          {t('templates.action.exportOva')}
        </DropdownItem>
      )}
      {includeMoveToFolder && isAdmin && (
        <DropdownItem
          icon={<FolderIcon />}
          onClick={() => {
            setIsOpen(false)
            setIsMoveOpen(true)
          }}
        >
          {t('folders.move.item')}
        </DropdownItem>
      )}
      <Divider component="li" />
      {blank ? (
        <DropdownItem
          icon={<TrashIcon />}
          isAriaDisabled
          tooltipProps={{ content: t('templates.remove.blankReason') }}
        >
          {t('common.action.remove')}
        </DropdownItem>
      ) : (
        <DropdownItem
          icon={<TrashIcon />}
          isDanger
          onClick={() => {
            setIsOpen(false)
            setRemoving({ nameInput: '' })
          }}
        >
          {t('common.action.remove')}
        </DropdownItem>
      )}
    </DropdownList>
  )

  return (
    <>
      {contextMenu !== undefined ? (
        <ContextMenu
          position={contextMenu.position}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          ariaLabel={t('common.action.actionsFor', { name: template.name })}
        >
          {menuItems}
        </ContextMenu>
      ) : (
        <Dropdown
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          popperProps={{ position: 'right' }}
          toggle={(toggleRef: Ref<MenuToggleElement>) => (
            <MenuToggle
              ref={toggleRef}
              aria-label={t('inventory.rowActions', { name: template.name })}
              variant="plain"
              icon={<EllipsisVIcon />}
              onClick={() => setIsOpen(!isOpen)}
              isExpanded={isOpen}
              isDisabled={remove.isPending}
            />
          )}
        >
          {menuItems}
        </Dropdown>
      )}

      {isCreatingVm && (
        // Preseed the wizard's Template step with this row's template, exactly
        // as the standalone CreateVmButton did on the flat TemplatesPage.
        <CreateVmWizardModal
          initialTemplateName={template.name}
          onClose={() => setIsCreatingVm(false)}
        />
      )}
      {isEditing && (
        <TemplateFormModal template={template} isOpen onClose={() => setIsEditing(false)} />
      )}
      {isExporting && (
        <TemplateExportModal template={template} onClose={() => setIsExporting(false)} />
      )}
      {isMoveOpen && (
        <MoveToFolderModal vms={[template]} kind="template" onClose={() => setIsMoveOpen(false)} />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('templates.remove.confirm.title', { name: template.name })}
          body={
            <Stack hasGutter>
              <StackItem>{t('templates.remove.confirm.body')}</StackItem>
              <StackItem>
                <FormGroup
                  label={t('templates.remove.confirm.typeLabel', { name: template.name })}
                  isRequired
                  fieldId={`template-remove-confirm-${template.id}`}
                >
                  <TextInput
                    id={`template-remove-confirm-${template.id}`}
                    aria-label={t('templates.remove.confirm.inputAria')}
                    value={removing.nameInput}
                    onChange={(_event, value) =>
                      setRemoving((current) =>
                        current ? { ...current, nameInput: value } : current,
                      )
                    }
                  />
                </FormGroup>
              </StackItem>
            </Stack>
          }
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={removing.nameInput !== template.name || remove.isPending}
          onConfirm={() => {
            setRemoving(null)
            remove.mutate({ id: template.id, name: template.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
