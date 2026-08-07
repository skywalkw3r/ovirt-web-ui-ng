import { describe, expect, it } from 'vitest'
import {
  copyDisabledReasonId,
  editDisabledReasonId,
  moveDisabledReasonId,
  removeDisabledReasonId,
  resizeDisabledReasonId,
  sparsifyDisabledReasonId,
} from './diskActionGuards'

// The shared disk action gating (webadmin DiskOperationsHelper rules) used by
// the Disks page kebab and the VM Disks tab. The direct-LUN rows are the ones
// this feature adds — image/locked rows pin the pre-existing behavior.

const imageOk = { status: 'ok', storage_type: 'image', sparse: true }
const imagePreallocated = { status: 'ok', storage_type: 'image', sparse: false }
const lunOk = { status: 'ok', storage_type: 'lun' }
const locked = { status: 'locked', storage_type: 'image', sparse: true }
const managedBlock = { status: 'ok', storage_type: 'managed_block_storage' }

describe('disk action guards — direct-LUN disks', () => {
  it('disables move/copy/sparsify/resize for a LUN disk with LUN-specific or image-only reasons', () => {
    expect(moveDisabledReasonId(lunOk)).toBe('disks.disabled.moveImageOnly')
    expect(copyDisabledReasonId(lunOk)).toBe('disks.disabled.copyImageOrBlock')
    expect(sparsifyDisabledReasonId(lunOk)).toBe('disks.disabled.sparsifyImageOnly')
    expect(resizeDisabledReasonId(lunOk)).toBe('disk.lun.disabled.resize')
  })

  it('keeps edit and remove available for a LUN disk', () => {
    expect(editDisabledReasonId(lunOk)).toBeUndefined()
    expect(removeDisabledReasonId(lunOk)).toBeUndefined()
  })
})

describe('disk action guards — image disks', () => {
  it('allows everything on a settled thin image disk', () => {
    expect(moveDisabledReasonId(imageOk)).toBeUndefined()
    expect(copyDisabledReasonId(imageOk)).toBeUndefined()
    expect(sparsifyDisabledReasonId(imageOk)).toBeUndefined()
    expect(resizeDisabledReasonId(imageOk)).toBeUndefined()
    expect(editDisabledReasonId(imageOk)).toBeUndefined()
    expect(removeDisabledReasonId(imageOk)).toBeUndefined()
  })

  it('sparsify additionally requires thin provisioning', () => {
    expect(sparsifyDisabledReasonId(imagePreallocated)).toBe('disks.disabled.sparsifyThinOnly')
  })

  it('copy allows managed block storage, move does not', () => {
    expect(copyDisabledReasonId(managedBlock)).toBeUndefined()
    expect(moveDisabledReasonId(managedBlock)).toBe('disks.disabled.moveImageOnly')
  })
})

describe('disk action guards — locked disks', () => {
  it('locks every action while an operation is in flight', () => {
    expect(moveDisabledReasonId(locked)).toBe('disks.disabled.locked')
    expect(copyDisabledReasonId(locked)).toBe('disks.disabled.locked')
    expect(sparsifyDisabledReasonId(locked)).toBe('disks.disabled.locked')
    expect(resizeDisabledReasonId(locked)).toBe('disks.disabled.locked')
    expect(editDisabledReasonId(locked)).toBe('disks.disabled.locked')
    expect(removeDisabledReasonId(locked)).toBe('disks.disabled.locked')
  })

  it('a LUN disk that is somehow locked still reports the LUN resize reason first', () => {
    // storage_type wins for resize: the action can never apply to a LUN disk,
    // locked or not.
    expect(resizeDisabledReasonId({ status: 'locked', storage_type: 'lun' })).toBe(
      'disk.lun.disabled.resize',
    )
  })
})
