import type { DragEvent } from 'react'
import type { Tag } from '../api/schemas/tag'
import type { Vm } from '../api/schemas/vm'

// Custom MIME type for VM row drags so the folder tree only reacts to its
// own payloads — text selections or files dragged in from outside never
// match. dataTransfer is text-only, so the payload is a JSON array of VM ids
// (always an array, even for one — both ends speak a single format).
export const VM_DRAG_TYPE = 'application/x-ovirt-vm-id'

// Row side (VmsPage spreads these onto each <Tr>): mark the row draggable
// and stamp the dragged ids into the payload — the whole selection when the
// grabbed row is part of a multi-select, just the row itself otherwise.
export function dragPropsFor(
  vm: Vm,
  selection: readonly Vm[] = [],
): {
  draggable: boolean
  onDragStart: (event: DragEvent<HTMLElement>) => void
} {
  return {
    draggable: true,
    onDragStart: (event) => {
      const ids =
        selection.length > 1 && selection.some((candidate) => candidate.id === vm.id)
          ? selection.map((candidate) => candidate.id)
          : [vm.id]
      event.dataTransfer.setData(VM_DRAG_TYPE, JSON.stringify(ids))
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

// Tree side, dragover: the payload itself is sealed until drop, but the type
// list is readable — enough to decide whether to accept the drag.
export function isVmDrag(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes(VM_DRAG_TYPE)
}

// Tree side, drop: [] when the drag was not a VM row (or the payload was
// somehow mangled — defensive parse, never throws).
export function parseDraggedVmIds(event: DragEvent<HTMLElement>): string[] {
  const payload = event.dataTransfer.getData(VM_DRAG_TYPE)
  if (payload === '') return []
  try {
    const parsed: unknown = JSON.parse(payload)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

// Folder nodes drag under their own MIME type so re-parenting and VM moves
// stay distinguishable during dragover, where only the type list is readable.
export const FOLDER_DRAG_TYPE = 'application/x-ovirt-folder-id'

export function folderDragPropsFor(tag: Tag): {
  draggable: boolean
  onDragStart: (event: DragEvent<HTMLElement>) => void
} {
  return {
    draggable: true,
    onDragStart: (event) => {
      // Nested folder nodes sit inside their parent's subtree — stop the
      // start event so an ancestor's handler can never restamp the payload
      // with its own id.
      event.stopPropagation()
      event.dataTransfer.setData(FOLDER_DRAG_TYPE, tag.id)
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

export function isFolderDrag(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)
}

export function parseDraggedFolderId(event: DragEvent<HTMLElement>): string | null {
  const folderId = event.dataTransfer.getData(FOLDER_DRAG_TYPE)
  return folderId === '' ? null : folderId
}

// Template rows (the VMs & Templates view) drag on their own channel with
// the same JSON-id-array payload as VM rows.
export const TEMPLATE_DRAG_TYPE = 'application/x-ovirt-template-id'

export function templateDragPropsFor(
  template: { id: string },
  selection: readonly { id: string }[] = [],
): {
  draggable: boolean
  onDragStart: (event: DragEvent<HTMLElement>) => void
} {
  return {
    draggable: true,
    onDragStart: (event) => {
      const ids =
        selection.length > 1 && selection.some((candidate) => candidate.id === template.id)
          ? selection.map((candidate) => candidate.id)
          : [template.id]
      event.dataTransfer.setData(TEMPLATE_DRAG_TYPE, JSON.stringify(ids))
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

// One row drag stamping BOTH channels — the VMs & Templates view's rows,
// where a webadmin-style multi-select can hold VMs and templates together.
// The folder tree's drop handler reads the two payloads from the same drop.
// Callers pass the ids the drag should carry (the whole selection when the
// grabbed row is part of one, just the row itself otherwise).
export function mixedDragPropsFor(
  vmIds: readonly string[],
  templateIds: readonly string[],
): {
  draggable: boolean
  onDragStart: (event: DragEvent<HTMLElement>) => void
} {
  return {
    draggable: true,
    onDragStart: (event) => {
      if (vmIds.length > 0) event.dataTransfer.setData(VM_DRAG_TYPE, JSON.stringify(vmIds))
      if (templateIds.length > 0)
        event.dataTransfer.setData(TEMPLATE_DRAG_TYPE, JSON.stringify(templateIds))
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

export function isTemplateDrag(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes(TEMPLATE_DRAG_TYPE)
}

export function parseDraggedTemplateIds(event: DragEvent<HTMLElement>): string[] {
  const payload = event.dataTransfer.getData(TEMPLATE_DRAG_TYPE)
  if (payload === '') return []
  try {
    const parsed: unknown = JSON.parse(payload)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
