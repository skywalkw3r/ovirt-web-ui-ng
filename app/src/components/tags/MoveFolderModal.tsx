import { useState } from 'react'
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TreeView,
  type ModalProps,
  type TreeViewDataItem,
} from '@patternfly/react-core'
import { FolderIcon, FolderOpenIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import { childFoldersOf, folderSubtreeIds } from '../../hooks/useTags'
import { useT } from '../../i18n/useT'

// Re-parent picker for the folder-tree context menu: a selectable tree of every eligible destination — all folders except
// the moving folder's own subtree (re-parenting into it would cycle), plus a
// 'Top level' sentinel that stands for the reserved root. The engine/mock 409
// still backstops a tree that changed underneath. `appendTo` exists for the
// manager, which portals its child modals inside its own modal box (see the
// aria-hidden note in TagManagerModal); the default (undefined) is <body>.
export function MoveFolderModal({
  folder,
  allTags,
  rootId,
  busy,
  onMove,
  onClose,
  appendTo,
}: {
  folder: Tag
  allTags: Tag[]
  rootId: string
  busy: boolean
  onMove: (parentId: string) => void
  onClose: () => void
  appendTo?: ModalProps['appendTo']
}) {
  const t = useT()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const excluded = folderSubtreeIds(allTags, folder.id)

  const toItem = (tag: Tag): TreeViewDataItem | null => {
    if (excluded.has(tag.id)) return null
    const children = childFoldersOf(allTags, tag.id)
      .map(toItem)
      .filter((child): child is TreeViewDataItem => child !== null)
    return {
      id: tag.id,
      name: tag.name,
      defaultExpanded: true,
      children: children.length > 0 ? children : undefined,
    }
  }

  const topLevel = childFoldersOf(allTags, rootId)
    .map(toItem)
    .filter((child): child is TreeViewDataItem => child !== null)
  const data: TreeViewDataItem[] = [
    {
      id: rootId,
      name: t('tags.moveFolder.topLevel'),
      defaultExpanded: true,
      children: topLevel.length > 0 ? topLevel : undefined,
    },
  ]

  // selecting the current parent is a no-op — keep Move disabled for it
  const currentParentId = folder.parent?.id

  return (
    <Modal
      variant="small"
      isOpen
      appendTo={appendTo}
      onClose={onClose}
      aria-labelledby="move-folder-title"
      aria-describedby="move-folder-body"
    >
      <ModalHeader
        title={t('tags.moveFolder.title', { name: folder.name })}
        labelId="move-folder-title"
      />
      <ModalBody id="move-folder-body">
        <TreeView
          aria-label={t('tags.moveFolder.treeLabel')}
          data={data}
          hasSelectableNodes
          icon={<FolderIcon />}
          expandedIcon={<FolderOpenIcon />}
          activeItems={selectedId !== null ? [{ id: selectedId, name: null }] : []}
          onSelect={(_event, item) => {
            if (item.id !== undefined) setSelectedId(item.id)
          }}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          isDisabled={selectedId === null || selectedId === currentParentId || busy}
          onClick={() => {
            if (selectedId !== null) onMove(selectedId)
          }}
        >
          <FormattedMessage id="tags.moveFolder.submit" />
        </Button>
        <Button variant="link" onClick={onClose}>
          <FormattedMessage id="tags.moveFolder.cancel" />
        </Button>
      </ModalFooter>
    </Modal>
  )
}
