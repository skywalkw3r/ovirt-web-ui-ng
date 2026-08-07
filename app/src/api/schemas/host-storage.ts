import { z } from 'zod'

// The live engine serializes numeric scalars as JSON strings (ports, LUN
// sizes), so every numeric field below coerces — same discipline as the other
// schemas.

// One discovered iSCSI target row. POST /hosts/{id}/iscsidiscover answers with
// an action envelope carrying `discovered_targets` (the current DiscoverIscsi
// field) whose wrapped list is `{ iscsi_details: [ IscsiDetails ] }`; the
// deprecated `iscsi_targets` is a bare string[] fallback (raw IQNs). IscsiDetails
// itself carries NO id — the LUN ids only surface after login via the host
// storage read. `target` is the IQN the login step then keys on.
export const IscsiDetailsSchema = z.looseObject({
  address: z.string().optional(),
  port: z.coerce.number().optional(),
  target: z.string().optional(),
  portal: z.string().optional(),
  paths: z.coerce.number().optional(),
  vendor_id: z.string().optional(),
  product_id: z.string().optional(),
  serial: z.string().optional(),
})

export const DiscoveredTargetsSchema = z.looseObject({
  iscsi_details: z.array(IscsiDetailsSchema).optional(),
})

// The action envelope both iscsidiscover answers land in: the current
// `discovered_targets` wrapper plus the deprecated `iscsi_targets` string[]
// alias the resource falls back to when the wrapper is absent.
export const IscsiDiscoverResponseSchema = z.looseObject({
  discovered_targets: DiscoveredTargetsSchema.optional(),
  iscsi_targets: z.looseObject({ iscsi_target: z.array(z.string()).optional() }).optional(),
})

// One LUN row from GET /hosts/{id}/storage. LogicalUnit is the id-bearing
// shape (IscsiDetails is not) — `id` is the LUN id fed into the block-domain
// create body. The graying/used guards read status, storage_domain_id (already
// part of a domain), disk_id (bound to a direct-LUN disk) and volume_group_id
// (LunStatus.Used → lunUsedByVG). Snake_case per the REST serialization
// (vendor_id, product_id, storage_domain_id, …).
export const LogicalUnitSchema = z.looseObject({
  id: z.string(),
  address: z.string().optional(),
  port: z.coerce.number().optional(),
  target: z.string().optional(),
  portal: z.string().optional(),
  // bytes; the live engine serializes numeric scalars as JSON strings
  size: z.coerce.number().optional(),
  paths: z.coerce.number().optional(),
  vendor_id: z.string().optional(),
  product_id: z.string().optional(),
  serial: z.string().optional(),
  lun_mapping: z.coerce.number().optional(),
  // LunStatus: 'Free' | 'Used' | 'Unusable' — open string, same rationale as
  // vm status. Unusable/Used rows grey out in the picker.
  status: z.string().optional(),
  // set when the LUN already belongs to a storage domain (grey unless the
  // domain is in maintenance) or is bound to a direct-LUN disk
  storage_domain_id: z.string().optional(),
  disk_id: z.string().optional(),
  // set on LunStatus.Used LUNs already in a volume group (lunUsedByVG warning)
  volume_group_id: z.string().optional(),
})

export const HostStorageSchema = z.looseObject({
  id: z.string().optional(),
  // StorageType: 'iscsi' | 'fcp' | 'nfs' | … — open string
  type: z.string().optional(),
  address: z.string().optional(),
  logical_units: z.looseObject({ logical_unit: z.array(LogicalUnitSchema).optional() }).optional(),
})

// JSON quirk: the "host_storage" key is omitted when the host reports none.
export const HostStorageListSchema = z.looseObject({
  host_storage: z.array(HostStorageSchema).optional(),
})

export type IscsiDetails = z.infer<typeof IscsiDetailsSchema>
export type LogicalUnit = z.infer<typeof LogicalUnitSchema>
export type HostStorage = z.infer<typeof HostStorageSchema>

// The flattened read model the modal's LUN table renders. Merges the id-bearing
// LogicalUnit fields with a derived `usedBy` reason so the picker can grey the
// row without re-deriving the guard everywhere.
export interface DiscoveredLun {
  id: string
  address?: string
  port?: number
  target?: string
  portal?: string
  size?: number
  vendorId?: string
  productId?: string
  serial?: string
  status?: string
  // populated when the LUN can't be selected: already in a domain, bound to a
  // disk, or otherwise unusable — mirrors SanStorageModelBase.updateGrayedOut.
  storageDomainId?: string
  diskId?: string
  volumeGroupId?: string
}
