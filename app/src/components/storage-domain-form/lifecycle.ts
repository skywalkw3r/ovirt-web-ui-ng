import type { StorageDomain } from '../../api/schemas/storage-domain'
import type { MessageId } from '../../i18n/messages/en'

// Status-gating logic shared by the list-row kebab and the detail-header menu,
// so the two entry points can never drift. Verified against the oVirt BLL
// command validators (ActivateStorageDomainCommand.checkStorageDomainStatus,
// DeactivateStorageDomainCommand.validateDomainStatus,
// DetachStorageDomainFromPoolCommand.canDetachDomain) and the webadmin
// StorageDataCenterListModel action guards.
//
// The engine may serialize status in either case; every predicate lowercases
// first (existing storage pages already do this).

// The single status string a domain reports: attached domains carry `status`
// ('active', 'maintenance', …); unattached ones carry only `external_status`
// ('ok', …). Returned lowercased, or undefined when neither is present.
export function domainStatus(domain: StorageDomain): string | undefined {
  return (domain.status ?? domain.external_status)?.toLowerCase()
}

// A domain is "attached" to a data center when it carries a `status` field —
// unattached domains report `external_status` only (schemas/storage-domain.ts).
export function isAttached(domain: StorageDomain): boolean {
  return domain.status !== undefined
}

// The data-center id the DC-scoped actions (detach/activate/deactivate) POST
// against. getStorageDomain follows data_centers, so an attached domain inlines
// exactly one; undefined for an unattached domain (no data_centers link).
export function attachedDataCenterId(domain: StorageDomain): string | undefined {
  return domain.data_centers?.data_center?.[0]?.id
}

// Attach is offered for an unattached domain (webadmin
// StorageDataCenterListModel: sharedStatus == Unattached), plus ISO domains
// (attachable to additional data centers). An already-attached data domain is
// not re-attachable here.
export function canAttach(domain: StorageDomain): boolean {
  return !isAttached(domain) || domain.type?.toLowerCase() === 'iso'
}

// Activate brings a deactivated domain back up: enabled for Inactive /
// Maintenance (also the transient Unknown/PreparingForMaintenance the backend
// tolerates). ActivateStorageDomainCommand.checkStorageDomainStatus.
const ACTIVATABLE_STATUSES = new Set([
  'inactive',
  'maintenance',
  'unknown',
  'preparing_for_maintenance',
])
export function canActivate(domain: StorageDomain): boolean {
  const status = domainStatus(domain)
  return status !== undefined && ACTIVATABLE_STATUSES.has(status)
}

// Maintenance (deactivate) is offered only for an Active domain
// (DeactivateStorageDomainCommand monitored statuses). The backend additionally
// blocks when running VMs hold disks here or the master domain has no active
// peer — those late faults surface as danger toasts; `force` (offered in the
// confirm) pushes a master-domain deactivation through.
export function canMaintenance(domain: StorageDomain): boolean {
  return domainStatus(domain) === 'active'
}

// Detach requires the domain be deactivated first: Maintenance / Inactive
// (DetachStorageDomainFromPoolCommand.canDetachDomain). The live engine 409s a
// detach of an Active domain, so gating here keeps the UI from ever sending it.
const DETACHABLE_STATUSES = new Set(['maintenance', 'inactive'])
export function canDetach(domain: StorageDomain): boolean {
  const status = domainStatus(domain)
  return status !== undefined && DETACHABLE_STATUSES.has(status)
}

// Remove (formatted, via host) removes a domain from the system. The engine
// removes an unattached domain, or one detached-but-known — never one still
// active in a pool. Practically: offered whenever the domain is not Active
// (an attached Active domain must be deactivated + detached first).
export function canRemove(domain: StorageDomain): boolean {
  return domainStatus(domain) !== 'active'
}

// Destroy (force remove-from-DB) is the last-resort purge for an unreachable
// domain; the backend contacts no host, so it is never status-gated. Always
// offered (behind a typed-name confirm).
export function canDestroy(): boolean {
  return true
}

// Update OVFs rewrites the OVF metadata store for every entity on a domain now
// (webadmin "Update OVFs"). The OVF store lives on data domains and the rewrite
// needs the domain up in its pool, so it is offered only for an Active data
// domain.
export function canUpdateOvfs(domain: StorageDomain): boolean {
  return domain.type?.toLowerCase() === 'data' && domainStatus(domain) === 'active'
}

// Refresh LUNs rescans a block domain's backing LUNs so a grown LUN is picked
// up at its new size. File domains (NFS/Gluster/POSIX) have no LUNs to rescan,
// so it is offered only for block (iSCSI/FCP) domains — read from the backing
// `storage.type` the list and detail reads both inline.
const BLOCK_STORAGE_TYPES = new Set(['iscsi', 'fcp'])
export function canRefreshLuns(domain: StorageDomain): boolean {
  const type = domain.storage?.type?.toLowerCase()
  return type !== undefined && BLOCK_STORAGE_TYPES.has(type)
}

// A block (iSCSI/FCP) domain — the precondition every LUN-management action
// shares (extend, reduce, refresh).
export function isBlockDomain(domain: StorageDomain): boolean {
  const type = domain.storage?.type?.toLowerCase()
  return type !== undefined && BLOCK_STORAGE_TYPES.has(type)
}

// Extend (add LUNs) grows a block domain in place. BLL
// ExtendSANStorageDomainCommand.validate requires the domain Active in its
// pool (the SPM performs the LVM extend), so it is offered only for an Active
// block domain.
export function canExtendLuns(domain: StorageDomain): boolean {
  return isBlockDomain(domain) && domainStatus(domain) === 'active'
}

// Reduce (remove LUNs) migrates their data to the remaining devices first.
// BLL ReduceSANStorageDomainDevicesCommand.validate requires the domain in
// MAINTENANCE, a block storage type, and a metadata format newer than V1 —
// gate on all three so the engine never 409s a request the UI could have
// blocked.
export function canReduceLuns(domain: StorageDomain): boolean {
  return (
    isBlockDomain(domain) &&
    domainStatus(domain) === 'maintenance' &&
    domain.storage_format?.toLowerCase() !== 'v1'
  )
}

// The disabled-reason tooltip shown when a gated action is unavailable, so the
// admin learns the precondition instead of a dead menu item. Keyed by action.
// Values are catalog MessageIds (storage.disabled.*) — this module is plain
// logic with no intl context, so consumers resolve them with t(...) at the
// tooltip call site.
export const DISABLED_REASONS = {
  attach: 'storage.disabled.attach',
  activate: 'storage.disabled.activate',
  maintenance: 'storage.disabled.maintenance',
  detach: 'storage.disabled.detach',
  remove: 'storage.disabled.remove',
  updateOvfs: 'storage.disabled.updateOvfs',
  refreshLuns: 'storage.disabled.refreshLuns',
  extendLuns: 'storage.disabled.extendLuns',
  reduceLuns: 'storage.disabled.reduceLuns',
} as const satisfies Record<string, MessageId>
