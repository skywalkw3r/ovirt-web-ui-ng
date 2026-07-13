import { useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Button,
  Divider,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  Skeleton,
  TreeView,
  type TreeViewDataItem,
} from '@patternfly/react-core'
import {
  FolderIcon,
  FolderOpenIcon,
  MigrationIcon,
  PencilAltIcon,
  PlusIcon,
  TrashIcon,
} from '@patternfly/react-icons'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { FormattedMessage } from 'react-intl'
import type { Tag } from '../../api/schemas/tag'
import type { Template } from '../../api/schemas/template'
import type { Vm } from '../../api/schemas/vm'
import { useCapabilities } from '../../auth/capabilities'
import { useT } from '../../i18n/useT'
import { loadCollapsedFolders, saveCollapsedFolders } from '../../lib/folderTreePrefs'
import { useMoveTemplateToFolder, useMoveVmToFolder } from '../../hooks/useMoveVmToFolder'
import {
  childFoldersOf,
  folderRootOf,
  folderSubtreeIds,
  folderVmCounts,
  useDeleteTag,
  useTags,
  useUpdateTag,
  type TaggedEntity,
} from '../../hooks/useTags'
import {
  folderDragPropsFor,
  isFolderDrag,
  isTemplateDrag,
  isVmDrag,
  parseDraggedFolderId,
  parseDraggedTemplateIds,
  parseDraggedVmIds,
} from '../../hooks/useVmDragDrop'
import { ConfirmModal } from '../ConfirmModal'
import { ContextMenu, treeRowContextValue, useContextMenu } from '../context-menu/ContextMenu'
import { CreateFolderModal } from './CreateFolderModal'
import { MoveFolderModal } from './MoveFolderModal'
import { RenameTagModal } from './RenameTagModal'
import './FolderTreePanel.css'

// Sentinel id for the synthetic 'All virtual machines' item — real tag ids
// are engine GUIDs, so it can never collide with a folder.
const ALL_VMS_ID = 'all-vms'

// Context-menu modal state, hoisted to the panel: the menu closes first
// (menu.close() in the item's onClick), then the chosen modal renders as a
// panel-level sibling of the tree — never inside the menu.
type FolderMenuModal =
  | { kind: 'create'; parent: Tag | null }
  | { kind: 'rename'; tag: Tag }
  | { kind: 'move'; tag: Tag }
  | { kind: 'delete'; tag: Tag }

// The drag payload carries only entity ids (dataTransfer is text-only), so a
// drop resolves the full entity from whichever list query rendered the
// dragged row — necessarily already cached.
function findCachedEntity<T extends { id: string }>(
  queryClient: QueryClient,
  listKey: 'vms' | 'templates',
  id: string,
): T | undefined {
  for (const [, entities] of queryClient.getQueriesData<T[]>({ queryKey: [listKey] })) {
    const entity = entities?.find((candidate) => candidate.id === id)
    if (entity !== undefined) return entity
  }
  return undefined
}

// Sidebar folder tree: descendants of the reserved 'ui.folders' tag, nested
// via parent links, under a synthetic all-entities root that clears the
// folder filter. Selection is fully controlled by the caller. Every node is
// also a drop target for VM/template rows (useVmDragDrop); dropping on the
// root means "no folder". `entities` are the caller's list rows (tags
// embedded via ?follow=tags) — they only feed the per-folder count badges,
// zero fetches; the VMs & Templates view concatenates both kinds.
export function FolderTreePanel({
  selectedFolderId,
  onSelect,
  entities,
  rootLabel,
  ariaLabel,
}: {
  selectedFolderId: string | null
  onSelect: (id: string | null) => void
  entities: TaggedEntity[]
  rootLabel?: string
  ariaLabel?: string
}) {
  const tags = useTags()
  const queryClient = useQueryClient()
  const { move, moveMany } = useMoveVmToFolder()
  const templateMove = useMoveTemplateToFolder()
  const update = useUpdateTag()
  const remove = useDeleteTag()
  const t = useT()
  // user tier gets a read-only tree: selection/filtering/badges work, drag
  // sources and drop targets don't mount (isAdmin is false until loaded —
  // the documented least-privilege default)
  const { isAdmin } = useCapabilities()
  // node id currently hovered by a VM or folder drag (ALL_VMS_ID for the root)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  // Expansion memory: PF TreeView expansion is uncontrolled (defaultExpanded
  // can only seed/force OPEN, never force-collapse — see folderTreePrefs), so
  // the collapsed set flips each item's defaultExpanded and persists through
  // localStorage. The synthetic root is always open and never persisted.
  const [collapsed, setCollapsed] = useState(() => loadCollapsedFolders())
  // vCenter-style right-click menu on folder nodes and the synthetic root —
  // admin tier only (user tier keeps the browser's native menu, mirroring
  // drag/drop above). ctx is the folder tag, or null for the root.
  const menu = useContextMenu<Tag | null>()
  const [folderModal, setFolderModal] = useState<FolderMenuModal | null>(null)

  const setFolderCollapsed = (id: string | undefined, isCollapsed: boolean) => {
    if (id === undefined || id === ALL_VMS_ID) return
    setCollapsed((current) => {
      const next = new Set(current)
      if (isCollapsed) next.add(id)
      else next.delete(id)
      saveCollapsedFolders(next)
      return next
    })
  }

  const acceptDrag = (event: DragEvent<HTMLElement>, id: string) => {
    if (!isAdmin) return
    // Folder drags can't be validated here — the payload is sealed until
    // drop, only the type list is readable — so every node accepts and the
    // drop handler rejects self/descendant targets.
    if (!isVmDrag(event) && !isTemplateDrag(event) && !isFolderDrag(event)) return
    // cancelling dragover is what allows the drop at all (HTML5 DnD)
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(id)
  }

  // Wrapping the node names (rather than reaching into PF internals) keeps
  // the drop wiring inside TreeView's public API; the co-located CSS
  // stretches the span across the node's text area. Folder nodes (tag !==
  // null) are themselves draggable — dropping one on another re-parents it.
  const dropZone = (label: string, tag: Tag | null) => {
    const folderId = tag?.id ?? null
    const id = folderId ?? ALL_VMS_ID
    return (
      <span
        className={
          dropTargetId === id
            ? 'folder-tree__drop-zone folder-tree__drop-zone--active'
            : 'folder-tree__drop-zone'
        }
        {...(isAdmin && tag !== null ? folderDragPropsFor(tag) : {})}
        // the tree-level contextmenu delegation (onTreeContextMenu below)
        // resolves the clicked node through this marker, so the menu opens
        // from ANYWHERE on the row — icon, badge, padding — not just the text
        data-folder-ctx={id}
        onDragEnter={(event) => acceptDrag(event, id)}
        onDragOver={(event) => acceptDrag(event, id)}
        // the functional update keeps a stale leave (old node) from clearing
        // the highlight the next node's dragenter just set
        onDragLeave={() => setDropTargetId((current) => (current === id ? null : current))}
        onDrop={(event) => {
          setDropTargetId(null)
          // A multi-select drag from the VMs & Templates view can carry BOTH
          // kinds in one payload (mixedDragPropsFor) — process the two
          // channels together, never return after just one.
          const vmIds = parseDraggedVmIds(event)
          const templateIds = parseDraggedTemplateIds(event)
          if (vmIds.length > 0 || templateIds.length > 0) {
            event.preventDefault()
            const draggedVms = vmIds
              .map((id) => findCachedEntity<Vm>(queryClient, 'vms', id))
              .filter((candidate): candidate is Vm => candidate !== undefined)
            // the move hooks toast success/failure, skip same-folder moves
            if (draggedVms.length === 1) void move(draggedVms[0], folderId)
            else if (draggedVms.length > 1) void moveMany(draggedVms, folderId)
            const draggedTemplates = templateIds
              .map((id) => findCachedEntity<Template>(queryClient, 'templates', id))
              .filter((candidate): candidate is Template => candidate !== undefined)
            if (draggedTemplates.length === 1) void templateMove.move(draggedTemplates[0], folderId)
            else if (draggedTemplates.length > 1)
              void templateMove.moveMany(draggedTemplates, folderId)
            return
          }
          const draggedId = parseDraggedFolderId(event)
          if (draggedId === null) return
          event.preventDefault()
          // Dropping on the root node means "make it top-level" (re-parent
          // onto the reserved root). Self/descendant/current-parent drops are
          // quiet no-ops — a tree that changed underneath still gets caught
          // by the engine/mock 409.
          const targetId = folderId ?? folderRootOf(all)?.id
          const dragged = all.find((t) => t.id === draggedId)
          if (targetId === undefined || dragged === undefined) return
          if (dragged.parent?.id === targetId) return
          if (folderSubtreeIds(all, draggedId).has(targetId)) return
          update.mutate({ tag: dragged, changes: { parentId: targetId } })
        }}
      >
        {label}
      </span>
    )
  }

  const toTreeItem = (tag: Tag, allTags: Tag[]): TreeViewDataItem => {
    const children = childFoldersOf(allTags, tag.id)
    return {
      id: tag.id,
      name: dropZone(tag.name, tag),
      defaultExpanded: !collapsed.has(tag.id),
      // subtree count (folderVmCounts propagates VMs to every ancestor), so
      // the badge matches exactly what selecting the node filters to
      customBadgeContent: counts.get(tag.id) ?? 0,
      children:
        children.length > 0 ? children.map((child) => toTreeItem(child, allTags)) : undefined,
    }
  }

  // Rebuilt every render (no memo): the drop highlight lives inside the node
  // names, and the tree is tiny at lab scale.
  const all = tags.data ?? []
  const root = folderRootOf(all)
  const counts = folderVmCounts(entities, all)
  const folders = root ? childFoldersOf(all, root.id).map((tag) => toTreeItem(tag, all)) : []
  const rootName = rootLabel ?? t('folders.tree.allVms')
  const data: TreeViewDataItem[] = [
    {
      id: ALL_VMS_ID,
      name: dropZone(rootName, null),
      defaultExpanded: true,
      customBadgeContent: entities.length,
      children: folders.length > 0 ? folders : undefined,
    },
  ]

  if (tags.isPending) {
    return (
      <>
        <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="1.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="1.5rem" screenreaderText={t('folders.tree.loading')} />
      </>
    )
  }

  if (tags.isError) {
    return (
      <EmptyState variant="sm" titleText={t('folders.tree.error.title')} status="danger">
        <EmptyStateBody>
          {tags.error instanceof Error ? tags.error.message : 'Unknown error'}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void tags.refetch()}>
          <FormattedMessage id="action.retry" />
        </Button>
      </EmptyState>
    )
  }

  // No folder subtree yet (fresh engine or nothing under 'ui.folders').
  if (data[0].children === undefined) {
    return (
      <EmptyState variant="sm" icon={FolderOpenIcon} titleText={t('folders.tree.empty.title')}>
        <EmptyStateBody className="folder-tree__empty-body">
          <FormattedMessage id="folders.tree.empty.body" />
        </EmptyStateBody>
      </EmptyState>
    )
  }

  const target = menu.target
  // null both when no menu is open and when the ROOT node was right-clicked —
  // the menu items only render inside the target guard, where null means root
  const menuFolder = target?.ctx ?? null
  const mutating = update.isPending || remove.isPending

  // vCenter-style right-click, delegated at the tree wrapper: the marker on
  // each node's name span carries the folder id, and treeRowContextValue
  // scopes the lookup to the one PF node row the click landed in — so the
  // whole row opens the menu, not just the name text. Unmarked area (below
  // the tree) keeps the browser's native menu; user tier keeps it everywhere.
  const onTreeContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isAdmin) return
    const id = treeRowContextValue(event, 'data-folder-ctx')
    if (id === null) return
    if (id === ALL_VMS_ID) {
      menu.open(event, null)
      return
    }
    const tag = all.find((candidate) => candidate.id === id)
    if (tag !== undefined) menu.open(event, tag)
  }

  return (
    <>
      <div onContextMenu={onTreeContextMenu}>
        <TreeView
          aria-label={ariaLabel ?? t('folders.tree.ariaLabel')}
          data={data}
          hasSelectableNodes
          hasBadges
          icon={<FolderIcon />}
          expandedIcon={<FolderOpenIcon />}
          // TreeView compares active items by id, so a bare stub is enough.
          activeItems={[{ id: selectedFolderId ?? ALL_VMS_ID, name: null }]}
          onSelect={(_event, item) => {
            onSelect(item.id === undefined || item.id === ALL_VMS_ID ? null : item.id)
          }}
          onExpand={(_event, item) => setFolderCollapsed(item.id, false)}
          onCollapse={(_event, item) => setFolderCollapsed(item.id, true)}
        />
      </div>

      {target && (
        <ContextMenu
          key={target.token}
          position={target.position}
          isOpen
          onOpenChange={(open) => {
            if (!open) menu.close()
          }}
          ariaLabel={t('common.action.actionsFor', { name: menuFolder?.name ?? rootName })}
        >
          <DropdownList>
            <DropdownItem
              icon={<PlusIcon />}
              onClick={() => {
                menu.close()
                setFolderModal({ kind: 'create', parent: menuFolder })
              }}
            >
              <FormattedMessage id="contextMenu.folder.create" />
            </DropdownItem>
            {menuFolder && (
              <>
                <DropdownItem
                  icon={<PencilAltIcon />}
                  onClick={() => {
                    menu.close()
                    setFolderModal({ kind: 'rename', tag: menuFolder })
                  }}
                >
                  <FormattedMessage id="contextMenu.folder.rename" />
                </DropdownItem>
                <DropdownItem
                  icon={<MigrationIcon />}
                  onClick={() => {
                    menu.close()
                    setFolderModal({ kind: 'move', tag: menuFolder })
                  }}
                >
                  <FormattedMessage id="contextMenu.folder.move" />
                </DropdownItem>
                <Divider component="li" />
                <DropdownItem
                  icon={<TrashIcon />}
                  isDanger
                  onClick={() => {
                    menu.close()
                    setFolderModal({ kind: 'delete', tag: menuFolder })
                  }}
                >
                  <FormattedMessage id="contextMenu.folder.delete" />
                </DropdownItem>
              </>
            )}
          </DropdownList>
        </ContextMenu>
      )}

      {folderModal?.kind === 'create' && (
        <CreateFolderModal parent={folderModal.parent} onClose={() => setFolderModal(null)} />
      )}

      {folderModal?.kind === 'rename' && (
        <RenameTagModal
          tag={folderModal.tag}
          busy={mutating}
          onRename={(name) => {
            setFolderModal(null)
            update.mutate({ tag: folderModal.tag, changes: { name } })
          }}
          onClose={() => setFolderModal(null)}
        />
      )}

      {folderModal?.kind === 'move' && root && (
        <MoveFolderModal
          folder={folderModal.tag}
          allTags={all}
          rootId={root.id}
          busy={mutating}
          onMove={(parentId) => {
            setFolderModal(null)
            update.mutate({ tag: folderModal.tag, changes: { parentId } })
          }}
          onClose={() => setFolderModal(null)}
        />
      )}

      {folderModal?.kind === 'delete' && (
        <ConfirmModal
          isOpen
          title={t('tags.delete.folderTitle', { name: folderModal.tag.name })}
          body={t('tags.delete.folderBody')}
          confirmLabel={t('tags.delete.confirm')}
          onConfirm={() => {
            setFolderModal(null)
            // no emptiness pre-check: the engine/mock 409s on a folder that
            // still has subfolders and the mutation surfaces it as the toast
            remove.mutate(folderModal.tag)
          }}
          onCancel={() => setFolderModal(null)}
        />
      )}
    </>
  )
}
