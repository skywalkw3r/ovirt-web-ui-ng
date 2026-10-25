import { lunSupportsDiscard } from '../../api/schemas/host-storage'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import type { MessageId } from '../../i18n/messages/en'

// "Enable Discard" (DiskAttachment.pass_discard) gating for the VM-context
// disk dialogs. Mirrors two upstream sources:
//   - ovirt-engine DiskVmElementValidator.isPassDiscardSupported (the BLL check
//     every add/attach/update runs): the interface must be VirtIO-SCSI, VirtIO,
//     IDE or SATA; a direct LUN must support discard (discard_max_size > 0); an
//     image on a FILE domain always may; an image on a BLOCK domain needs the
//     domain's supports_discard and wipe-after-delete off; any other storage
//     (managed block, Cinder, ...) is refused.
//   - webadmin AbstractDiskModel.updatePassDiscardAvailability/Changeability:
//     hidden for floating disks and for non file/block storage, disabled with a
//     reason when the storage cannot discard.
// The interface rule is shown disabled-with-reason (webadmin hides it) so the
// user can see why. The engine stays the backstop: its faults surface verbatim.

// api-model DiskInterface spellings the engine lets pass discard
const DISCARD_INTERFACES = new Set(['virtio_scsi', 'virtio', 'ide', 'sata'])

const FILE_STORAGE_TYPES = new Set(['nfs', 'posixfs', 'glusterfs', 'localfs'])
const BLOCK_STORAGE_TYPES = new Set(['iscsi', 'fcp'])

export type PassDiscardReason = 'interface' | 'storage' | 'wipeAfterDelete' | 'selectLun'

// The message id for each reason, rendered by PassDiscardField. "storage"
// shares the storage domain dialogs' wording.
export const PASS_DISCARD_REASON_IDS: Record<PassDiscardReason, MessageId> = {
  interface: 'diskForm.passDiscard.interface',
  storage: 'storageForm.discard.unsupported',
  wipeAfterDelete: 'diskForm.passDiscard.wipe',
  selectLun: 'diskForm.passDiscard.selectLun',
}

export interface PassDiscardInput {
  // 'image' | 'lun' | 'managed_block_storage' (engine DiskStorageType)
  diskStorageType: string | undefined
  // the attachment's interface (api-model spelling)
  diskInterface: string | undefined
  // image disks: the (target) storage domain, from the cached inventory
  domain?: StorageDomain
  // direct-LUN disks: the bound / picked LUN, wire or read-model spelling
  lun?: { discardMaxSize?: number; discard_max_size?: number }
  // the disk's effective wipe-after-delete
  wipeAfterDelete?: boolean
}

export interface PassDiscardState {
  // false hides the checkbox (no VM context, or storage that can never discard)
  visible: boolean
  // true greys the checkbox; the effective value is then forced to false
  disabled: boolean
  reason?: PassDiscardReason
}

const HIDDEN: PassDiscardState = { visible: false, disabled: true }

export function passDiscardState(input: PassDiscardInput): PassDiscardState {
  const storageType = input.diskStorageType ?? 'image'
  if (storageType === 'lun') {
    if (!DISCARD_INTERFACES.has(input.diskInterface ?? '')) {
      return { visible: true, disabled: true, reason: 'interface' }
    }
    if (input.lun === undefined) return { visible: true, disabled: true, reason: 'selectLun' }
    return lunSupportsDiscard(input.lun)
      ? { visible: true, disabled: false }
      : { visible: true, disabled: true, reason: 'storage' }
  }
  if (storageType !== 'image') return HIDDEN
  // webadmin needs a selected internal (file/block) domain before it offers the
  // flag at all; Cinder/managed-block/Glance domains never pass discard
  const domainType = input.domain?.storage?.type ?? ''
  const isFile = FILE_STORAGE_TYPES.has(domainType)
  const isBlock = BLOCK_STORAGE_TYPES.has(domainType)
  if (!isFile && !isBlock) return HIDDEN
  if (!DISCARD_INTERFACES.has(input.diskInterface ?? '')) {
    return { visible: true, disabled: true, reason: 'interface' }
  }
  if (isFile) return { visible: true, disabled: false }
  // Block domain. supports_discard is read-only engine state; an explicit false
  // blocks, an absent value (older engine / sparse list read) is left to the
  // engine's own check rather than guessed.
  if (input.domain?.supports_discard === false) {
    return { visible: true, disabled: true, reason: 'storage' }
  }
  if (input.wipeAfterDelete === true) {
    return { visible: true, disabled: true, reason: 'wipeAfterDelete' }
  }
  return { visible: true, disabled: false }
}

// The value that actually rides: a disabled checkbox never sends true.
export function effectivePassDiscard(state: PassDiscardState, checked: boolean): boolean {
  return state.visible && !state.disabled && checked
}

// webadmin AbstractDiskModel.updateWipeAfterDeleteChangeability: an image on a
// block domain cannot turn wipe-after-delete on while discard is passed.
export function wipeLockedByPassDiscard(
  domain: StorageDomain | undefined,
  passDiscard: boolean,
): boolean {
  return passDiscard && BLOCK_STORAGE_TYPES.has(domain?.storage?.type ?? '')
}
