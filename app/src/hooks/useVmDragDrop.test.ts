import { describe, expect, it, vi } from 'vitest'
import type { DragEvent } from 'react'
import type { Vm } from '../api/schemas/vm'
import {
  FOLDER_DRAG_TYPE,
  VM_DRAG_TYPE,
  dragPropsFor,
  folderDragPropsFor,
  isFolderDrag,
  isVmDrag,
  mixedDragPropsFor,
  parseDraggedFolderId,
  parseDraggedTemplateIds,
  parseDraggedVmIds,
} from './useVmDragDrop'

const vm = (id: string): Vm => ({ id, name: id })

// Minimal DataTransfer stand-in: jsdom does not implement drag events, and
// the helpers only touch setData/getData/types/effectAllowed.
function stubDragEvent(): DragEvent<HTMLElement> & { stopPropagation: () => void } {
  const store = new Map<string, string>()
  return {
    dataTransfer: {
      setData: (type: string, value: string) => void store.set(type, value),
      getData: (type: string) => store.get(type) ?? '',
      get types() {
        return [...store.keys()]
      },
      effectAllowed: 'none',
      dropEffect: 'none',
    },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as DragEvent<HTMLElement> & { stopPropagation: () => void }
}

describe('VM drag payload', () => {
  it('round-trips a single VM as a one-element id array', () => {
    const event = stubDragEvent()
    dragPropsFor(vm('vm-01')).onDragStart(event)

    expect(isVmDrag(event)).toBe(true)
    expect(isFolderDrag(event)).toBe(false)
    expect(parseDraggedVmIds(event)).toEqual(['vm-01'])
    expect(event.dataTransfer.effectAllowed).toBe('move')
  })

  it('drags the whole selection when the grabbed row is part of it', () => {
    const selection = [vm('vm-01'), vm('vm-02'), vm('vm-03')]
    const event = stubDragEvent()
    dragPropsFor(vm('vm-02'), selection).onDragStart(event)

    expect(parseDraggedVmIds(event)).toEqual(['vm-01', 'vm-02', 'vm-03'])
  })

  it('drags only the grabbed row when it is outside the selection', () => {
    const selection = [vm('vm-01'), vm('vm-03')]
    const event = stubDragEvent()
    dragPropsFor(vm('vm-02'), selection).onDragStart(event)

    expect(parseDraggedVmIds(event)).toEqual(['vm-02'])
  })

  it('a one-row selection behaves like a plain row drag', () => {
    const event = stubDragEvent()
    dragPropsFor(vm('vm-01'), [vm('vm-01')]).onDragStart(event)

    expect(parseDraggedVmIds(event)).toEqual(['vm-01'])
  })

  it('returns [] for non-VM drags', () => {
    const event = stubDragEvent()
    expect(isVmDrag(event)).toBe(false)
    expect(parseDraggedVmIds(event)).toEqual([])
  })

  it('returns [] for mangled payloads instead of throwing', () => {
    for (const payload of ['not json', '"vm-01"', '{"id":"vm-01"}', '[1,2]']) {
      const event = stubDragEvent()
      event.dataTransfer.setData(VM_DRAG_TYPE, payload)
      expect(parseDraggedVmIds(event)).toEqual([])
    }
    // a mixed array keeps its string members
    const event = stubDragEvent()
    event.dataTransfer.setData(VM_DRAG_TYPE, '["vm-01", 2]')
    expect(parseDraggedVmIds(event)).toEqual(['vm-01'])
  })
})

describe('folder drag payload', () => {
  it('round-trips the folder id on its own MIME channel', () => {
    const event = stubDragEvent()
    folderDragPropsFor({ id: 'tag-web', name: 'web' }).onDragStart(event)

    expect(isFolderDrag(event)).toBe(true)
    expect(isVmDrag(event)).toBe(false)
    expect(parseDraggedFolderId(event)).toBe('tag-web')
    expect(parseDraggedVmIds(event)).toEqual([])
  })

  it('stops propagation so ancestor folder nodes cannot restamp the payload', () => {
    const event = stubDragEvent()
    folderDragPropsFor({ id: 'tag-web', name: 'web' }).onDragStart(event)

    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('returns null for non-folder drags', () => {
    const event = stubDragEvent()
    dragPropsFor(vm('vm-01')).onDragStart(event)

    expect(parseDraggedFolderId(event)).toBeNull()
  })

  it('exposes distinct MIME types', () => {
    expect(VM_DRAG_TYPE).not.toBe(FOLDER_DRAG_TYPE)
  })
})

describe('mixed selection drag payload', () => {
  it('stamps both channels so one drop moves VMs and templates together', () => {
    const event = stubDragEvent()
    mixedDragPropsFor(['vm-01', 'vm-02'], ['tpl-01']).onDragStart(event)

    expect(isVmDrag(event)).toBe(true)
    expect(parseDraggedVmIds(event)).toEqual(['vm-01', 'vm-02'])
    expect(parseDraggedTemplateIds(event)).toEqual(['tpl-01'])
    expect(event.dataTransfer.effectAllowed).toBe('move')
  })

  it('omits an empty channel entirely (single-kind drags stay single-typed)', () => {
    const event = stubDragEvent()
    mixedDragPropsFor(['vm-01'], []).onDragStart(event)

    expect(isVmDrag(event)).toBe(true)
    expect(event.dataTransfer.types).not.toContain('application/x-ovirt-template-id')
    expect(parseDraggedTemplateIds(event)).toEqual([])
  })
})
