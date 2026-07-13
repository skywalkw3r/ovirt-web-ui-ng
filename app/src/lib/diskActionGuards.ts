import type { MessageId } from '../i18n/messages/en'

// Client-side disk action gating (webadmin DiskOperationsHelper /
// VmDiskListModel rules), shared by the Disks page kebab and the VM Disks tab
// so direct-LUN and locked disks are disabled consistently everywhere. Each
// guard returns the i18n id of the disabled reason (rendered as the menu
// item's description/tooltip) or undefined when the action is allowed. The
// engine is the real gate — it faults and the toast surfaces the fault — but
// disabling with a reason keeps the kebab honest and avoids firing an action
// that plainly cannot succeed.

// The slice of the Disk / followed-attachment-disk shape the guards read.
export interface GuardableDisk {
  status?: string
  storage_type?: string
  sparse?: boolean
}

// Move: OK status, IMAGE storage type (LUN/managed-block excluded). Same-DC
// and not-OVF/not-template are engine-enforced (the flat list lacks the
// fields to check them client-side).
export function moveDisabledReasonId(disk: GuardableDisk): MessageId | undefined {
  if (disk.status === 'locked') return 'disks.disabled.locked'
  if (disk.status !== 'ok') return 'disks.disabled.notOk'
  if (disk.storage_type !== 'image') return 'disks.disabled.moveImageOnly'
  return undefined
}

// Copy: same as move but managed-block is allowed too (DiskOperationsHelper).
export function copyDisabledReasonId(disk: GuardableDisk): MessageId | undefined {
  if (disk.status === 'locked') return 'disks.disabled.locked'
  if (disk.status !== 'ok') return 'disks.disabled.notOk'
  if (disk.storage_type !== 'image' && disk.storage_type !== 'managed_block_storage') {
    return 'disks.disabled.copyImageOrBlock'
  }
  return undefined
}

// Sparsify: OK status, IMAGE only, thin/sparse (preallocated disks have
// nothing to reclaim). The "attached to a running VM must be unplugged" rule
// is engine-enforced.
export function sparsifyDisabledReasonId(disk: GuardableDisk): MessageId | undefined {
  if (disk.status === 'locked') return 'disks.disabled.locked'
  if (disk.status !== 'ok') return 'disks.disabled.notOk'
  if (disk.storage_type !== 'image') return 'disks.disabled.sparsifyImageOnly'
  if (disk.sparse !== true) return 'disks.disabled.sparsifyThinOnly'
  return undefined
}

// Resize (extend): a direct-LUN disk has no image to grow — webadmin's
// EditDiskModel keeps sizeExtend unavailable for LUN disks — and a locked
// disk is mid-operation.
export function resizeDisabledReasonId(disk: GuardableDisk): MessageId | undefined {
  if (disk.storage_type === 'lun') return 'disk.lun.disabled.resize'
  if (disk.status === 'locked') return 'disks.disabled.locked'
  return undefined
}

// Edit: webadmin enables the dialog for a single non-OVF, non-locked,
// non-template disk; only the locked state is visible client-side. Direct-LUN
// disks ARE editable (alias/description/shareable/wipe) — the form itself
// hides the image-only fields.
export function editDisabledReasonId(disk: GuardableDisk): MessageId | undefined {
  if (disk.status === 'locked') return 'disks.disabled.locked'
  return undefined
}

// Remove (webadmin isRemoveCommandAvailable): only a `locked` disk is refused
// — illegal AND direct-LUN disks are removable.
export function removeDisabledReasonId(disk: GuardableDisk): MessageId | undefined {
  if (disk.status === 'locked') return 'disks.disabled.locked'
  return undefined
}
