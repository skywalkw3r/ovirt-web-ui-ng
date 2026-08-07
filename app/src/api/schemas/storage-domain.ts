import { z } from 'zod'

// Linked entities the engine returns as bare { id, href } unless the read uses
// ?follow=; getStorageDomain follows data_centers so their names are present.
// Same shape and rationale as the LinkedEntity in schemas/vm.ts.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

// the live engine serializes booleans as strings ("true"/"false")
const BooleanishSchema = z.union([z.boolean(), z.stringbool()])

// One LUN backing a block (iSCSI/FCP) domain, as the domain read inlines it
// under storage.logical_units. `id` is the only load-bearing field for the
// create/extend bodies; size/serial/vendor/product read back so the
// reduce-LUNs picker can label rows without a host-scoped SAN read. The richer
// discovery-time shape (status, storage_domain_id, …) stays in
// schemas/host-storage.ts — this is the domain's own read model.
export const StorageDomainLogicalUnitSchema = z.looseObject({
  id: z.string(),
  // bytes; the live engine serializes numeric scalars as JSON strings
  size: z.coerce.number().optional(),
  serial: z.string().optional(),
  vendor_id: z.string().optional(),
  product_id: z.string().optional(),
})

export type StorageDomainLogicalUnit = z.infer<typeof StorageDomainLogicalUnitSchema>

export const StorageDomainSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  comment: z.string().optional(),
  // 'data' | 'iso' | 'export' — open string, same rationale as vm status
  type: z.string().optional(),
  // domains attached to a data center report "status"; unattached ones
  // report only "external_status"
  status: z.string().optional(),
  external_status: z.string().optional(),
  // bytes; the live engine serializes numeric scalars as JSON strings
  available: z.coerce.number().optional(),
  used: z.coerce.number().optional(),
  committed: z.coerce.number().optional(),
  // 'v4' | 'v5' — the on-disk metadata format version
  storage_format: z.string().optional(),
  master: BooleanishSchema.optional(),
  // percent free below which the engine raises a low-space warning
  warning_low_space_indicator: z.coerce.number().optional(),
  // GB free below which the engine blocks new disk allocations
  critical_space_action_blocker: z.coerce.number().optional(),
  wipe_after_delete: BooleanishSchema.optional(),
  discard_after_delete: BooleanishSchema.optional(),
  backup: BooleanishSchema.optional(),
  supports_discard: BooleanishSchema.optional(),
  // the backing storage connection (nfs/iscsi/fc/glusterfs details)
  storage: z
    .looseObject({
      type: z.string().optional(),
      address: z.string().optional(),
      path: z.string().optional(),
      nfs_version: z.string().optional(),
      // Block domains (iscsi/fcp) back onto LUNs instead of an NFS export.
      // The engine wraps the array in a { logical_unit: [...] } envelope (the
      // same wrapped-list convention as data_centers).
      logical_units: z
        .looseObject({
          logical_unit: z.array(StorageDomainLogicalUnitSchema).optional(),
        })
        .optional(),
    })
    .optional(),
  // Linked entities — bare { id, href } without ?follow=, inlined with name
  // once followed. General renders the attached data-center names from these.
  // The followed data_center entry also carries the domain's status WITHIN that
  // DC (active/maintenance/…) — webadmin's "Cross Data Center Status". The live
  // top-level /storagedomains read omits the flat `status`, so this is the only
  // attachment-status signal on the list; the list StatusCell reads it.
  data_centers: z
    .looseObject({
      data_center: z.array(LinkedEntity.extend({ status: z.string().optional() })).optional(),
    })
    .optional(),
})

// JSON quirk: the "storage_domain" key is omitted when the list is empty.
export const StorageDomainListSchema = z.looseObject({
  storage_domain: z.array(StorageDomainSchema).optional(),
})

export type StorageDomain = z.infer<typeof StorageDomainSchema>
