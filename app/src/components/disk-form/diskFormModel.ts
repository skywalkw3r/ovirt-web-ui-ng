import type { StorageDomain } from '../../api/schemas/storage-domain'

// The pure rules the disk forms share — the VM tab's Add disk dialog
// (AddDiskModal) and the floating-disk create/edit form (DiskFormModal) both
// derive their image-disk defaults from these, so the two can never disagree
// on what a block storage domain or a size floor means.

export const GiB = 1024 ** 3
export const MIN_DISK_SIZE_GIB = 1
// modest thin-provisioned starting point; cow/sparse means it costs little
export const DEFAULT_DISK_SIZE_GIB = 10

// The disk-profile picker's sentinel for "let the engine assign the storage
// domain's default profile" — distinct from a real profile id so the forms
// can omit disk_profile from the body when it's selected.
export const DEFAULT_PROFILE = ''

// The disk kinds the create forms offer, gated by the Image | Direct LUN radio
// (webadmin NewDiskModel's DiskStorageType).
export type DiskFormKind = 'image' | 'lun'

// Allocation ⇒ format/sparse, authoritative per webadmin NewDiskModel /
// AsyncDataProvider.getDiskVolumeFormat: Thin = Sparse ⇒ cow+sparse;
// Preallocated ⇒ raw+!sparse. A regular block (iscsi/fcp) storage domain
// DEFAULTS to Preallocated but stays changeable — the user may switch back to
// Thin (cow/sparse on a block SD is engine-accepted). Only MANAGED block storage
// (Cinder) is truly non-changeable — updateVolumeType calls setIsChangeable(false)
// only for that type; for iscsi/fcp it just sets the default while leaving the
// radio changeable.
export type Allocation = 'thin' | 'preallocated'

export interface AllocationDerivation {
  format: 'cow' | 'raw'
  sparse: boolean
}

export function deriveAllocation(allocation: Allocation): AllocationDerivation {
  return allocation === 'thin' ? { format: 'cow', sparse: true } : { format: 'raw', sparse: false }
}

// Regular block domains back onto LUNs (iscsi/fcp). webadmin defaults their
// allocation to Preallocated but leaves the radio changeable; the flat
// /storagedomains list carries storage.type so we can apply that same default.
export const BLOCK_STORAGE_TYPES = new Set(['iscsi', 'fcp'])

export function isBlockDomain(domain: StorageDomain | undefined): boolean {
  return domain !== undefined && BLOCK_STORAGE_TYPES.has(domain.storage?.type ?? '')
}

// Managed block storage (Cinder) is the one type webadmin makes non-changeable:
// updateVolumeType locks the volume type to Preallocated there. The flat list
// carries storage.type so we can lock the radio client-side rather than letting
// the engine fault.
export function isManagedBlockDomain(domain: StorageDomain | undefined): boolean {
  return domain !== undefined && domain.storage?.type === 'managed_block_storage'
}

// Image disks can only live on data domains (iso/export domains hold other
// content types) — same narrowing as MoveCopyDiskModal.
export function dataDomains(domains: StorageDomain[]): StorageDomain[] {
  return domains.filter((domain) => domain.type === 'data')
}

export interface ResolvedAllocation {
  // the picked SD locks the radio to Preallocated (managed block storage)
  managedBlockDomain: boolean
  // the picked SD defaults to Preallocated (any block kind)
  blockDefaultPreallocated: boolean
  // what the radio shows and the body sends
  effective: Allocation
  derived: AllocationDerivation
}

// The allocation the form is really on: a managed block SD forces
// Preallocated; otherwise the user's explicit pick sticks once made (webadmin's
// isUserSelectedVolumeType), and until then a block SD nudges the default to
// Preallocated while everything else starts Thin.
export function resolveAllocation({
  domain,
  allocation,
  touched,
}: {
  domain: StorageDomain | undefined
  allocation: Allocation
  touched: boolean
}): ResolvedAllocation {
  const managedBlockDomain = isManagedBlockDomain(domain)
  const blockDefaultPreallocated = isBlockDomain(domain) || managedBlockDomain
  const effective: Allocation = managedBlockDomain
    ? 'preallocated'
    : touched
      ? allocation
      : blockDefaultPreallocated
        ? 'preallocated'
        : 'thin'
  return {
    managedBlockDomain,
    blockDefaultPreallocated,
    effective,
    derived: deriveAllocation(effective),
  }
}

// A new image disk's size: a number of GiB at or above the floor ('' while the
// input is cleared mid-edit, NaN on garbage — both invalid).
export function isDiskSizeValid(sizeGib: number | ''): boolean {
  return typeof sizeGib === 'number' && sizeGib >= MIN_DISK_SIZE_GIB
}
