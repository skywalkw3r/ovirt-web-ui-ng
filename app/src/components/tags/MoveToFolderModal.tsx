import { useEffect, useState } from 'react'
import {
  Button,
  DropdownItem,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Skeleton,
  TreeView,
  type TreeViewDataItem,
} from '@patternfly/react-core'
import { FolderIcon, FolderOpenIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import type { Vm } from '../../api/schemas/vm'
import { useMoveTemplateToFolder, useMoveVmToFolder } from '../../hooks/useMoveVmToFolder'
import {
  childFoldersOf,
  folderRootOf,
  folderTagsOf,
  useTags,
  useTemplateTags,
  useVmTags,
} from '../../hooks/useTags'
import { useT } from '../../i18n/useT'

// Sentinel id for the synthetic 'No folder' item — real tag ids are engine
// GUIDs, so it can never collide with a folder.
const NO_FOLDER_ID = 'no-folder'

// Marker class the click shield below uses to recognize its own modal.
const MODAL_CLASS = 'move-to-folder-modal'

function toTreeItem(tag: Tag, allTags: Tag[]): TreeViewDataItem {
  const children = childFoldersOf(allTags, tag.id)
  return {
    id: tag.id,
    name: tag.name,
    defaultExpanded: true,
    children: children.length > 0 ? children.map((child) => toTreeItem(child, allTags)) : undefined,
  }
}

// The kebab Dropdown closes on any window-level click outside its menu, and
// closing unmounts its items — including this one and the modal it renders.
// The modal is portaled to document.body, so every click inside it would
// otherwise kill the modal mid-interaction. While the modal is open, stop
// those clicks at the document level: React's own listeners attach lower
// (the app and portal roots), so the modal keeps working, and the event
// simply never reaches the dropdown's window listener. Clicks on the
// backdrop stay unshielded — they dismiss menu and modal together, which
// reads as the usual "click away to cancel".
function useMenuClickShield() {
  useEffect(() => {
    const shield = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(`.${MODAL_CLASS}`)) {
        event.stopPropagation()
      }
    }
    document.addEventListener('click', shield)
    return () => document.removeEventListener('click', shield)
  }, [])
}

// Keyboard-accessible counterpart to dragging a row onto the folder tree: a
// kebab item opening a folder picker (single select, incl. 'No folder').
export function MoveToFolderModalItem({ vm }: { vm: Vm }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <DropdownItem icon={<FolderIcon />} onClick={() => setIsOpen(true)}>
        <FormattedMessage id="folders.move.item" />
      </DropdownItem>
      {isOpen && <MoveToFolderModal vms={[vm]} onClose={() => setIsOpen(false)} />}
    </>
  )
}

// Exported for BulkActionsToolbar and the VMs & Templates view: the same
// picker moves one entity (kebab items, preselecting its current folder) or
// a whole selection (no preselection — a batch never defaults to "No
// folder", Move stays disabled until an explicit choice). kind selects the
// endpoints/cache keys; VMs and templates share the folder vocabulary.
export function MoveToFolderModal({
  vms,
  kind = 'vm',
  onClose,
}: {
  vms: Array<{ id: string; name: string }>
  kind?: 'vm' | 'template'
  onClose: () => void
}) {
  const single = vms.length === 1 ? vms[0] : undefined
  const t = useT()
  const tags = useTags()
  // Only a lone entity has a meaningful "current folder" to preselect; the
  // two hooks run unconditionally (rules of hooks), gated by enabled.
  const vmTags = useVmTags(single?.id ?? '', {
    enabled: single !== undefined && kind === 'vm',
  })
  const templateTags = useTemplateTags(single?.id ?? '', {
    enabled: single !== undefined && kind === 'template',
  })
  const entityTags = kind === 'vm' ? vmTags : templateTags
  const vmMove = useMoveVmToFolder()
  const templateMove = useMoveTemplateToFolder()
  const { moveMany } = kind === 'vm' ? vmMove : templateMove
  // undefined = untouched; for a single entity the effective selection falls
  // back to its current folder (or 'No folder') once the tag queries land.
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  useMenuClickShield()

  const all = tags.data ?? []
  const currentFolderId =
    single !== undefined
      ? (folderTagsOf(entityTags.data ?? [], all)[0]?.id ?? NO_FOLDER_ID)
      : undefined
  const activeId = selectedId ?? currentFolderId

  const root = folderRootOf(all)
  const data: TreeViewDataItem[] = [
    { id: NO_FOLDER_ID, name: t('folders.move.noFolder') },
    ...(root ? childFoldersOf(all, root.id).map((tag) => toTreeItem(tag, all)) : []),
  ]

  const isReady = tags.isSuccess && (single === undefined || entityTags.isSuccess)
  const error = tags.error ?? entityTags.error
  const title =
    single !== undefined
      ? t('folders.move.title.single', { name: single.name })
      : kind === 'vm'
        ? t('folders.move.title.batch', { count: vms.length })
        : t('folders.move.title.batchTpl', { count: vms.length })

  const submit = () => {
    if (activeId === undefined) return
    onClose()
    // the move hook toasts success/failure and skips same-folder moves
    void moveMany(vms, activeId === NO_FOLDER_ID ? null : activeId)
  }

  return (
    <Modal
      variant="small"
      className={MODAL_CLASS}
      isOpen
      onClose={onClose}
      aria-labelledby="move-to-folder-title"
      aria-describedby="move-to-folder-body"
    >
      <ModalHeader title={title} labelId="move-to-folder-title" />
      <ModalBody id="move-to-folder-body">
        {(tags.isPending || (single !== undefined && entityTags.isPending)) && (
          <>
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton height="1.5rem" screenreaderText={t('folders.tree.loading')} />
          </>
        )}

        {(tags.isError || (single !== undefined && entityTags.isError)) && (
          <EmptyState variant="sm" titleText={t('folders.tree.error.title')} status="danger">
            <EmptyStateBody>
              {error instanceof Error ? error.message : t('common.error.unknown')}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button
                  variant="primary"
                  onClick={() => {
                    void tags.refetch()
                    void entityTags.refetch()
                  }}
                >
                  <FormattedMessage id="action.retry" />
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )}

        {isReady && (
          <TreeView
            aria-label={
              single !== undefined
                ? t('folders.move.chooseFor.single', { name: single.name })
                : kind === 'vm'
                  ? t('folders.move.chooseFor.batch', { count: vms.length })
                  : t('folders.move.chooseFor.batchTpl', { count: vms.length })
            }
            data={data}
            hasSelectableNodes
            icon={<FolderIcon />}
            expandedIcon={<FolderOpenIcon />}
            // TreeView compares active items by id, so a bare stub is enough.
            activeItems={activeId !== undefined ? [{ id: activeId, name: null }] : []}
            onSelect={(_event, item) => setSelectedId(item.id ?? NO_FOLDER_ID)}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" isDisabled={!isReady || activeId === undefined} onClick={submit}>
          <FormattedMessage id="folders.move.submit" />
        </Button>
        <Button variant="link" onClick={onClose}>
          <FormattedMessage id="folders.move.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
