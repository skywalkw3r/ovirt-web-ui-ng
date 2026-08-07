import { z } from 'zod'
import { LogicalUnitSchema } from './host-storage'

// the live engine serializes booleans as strings ("true"/"false")
const BooleanishSchema = z.union([z.boolean(), z.stringbool()])

// Linked entities the engine returns as bare { id, href } unless the read uses
// ?follow=; getDisk follows storage_domains so their names are present. Same
// LinkedEntity shape used by the enriched VM schema.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

// The SAN backing of a direct-LUN disk (storage_type 'lun'). `type` is
// 'iscsi' | 'fcp' (open string, same rationale as vm status); logical_units
// wraps the LUN the disk binds to — webadmin binds exactly one per disk, but
// the wire shape is a list. Reuses the host-storage LogicalUnitSchema so LUN
// scalars (size, port) coerce their JSON-string forms exactly like the SAN
// discovery reads.
export const LunStorageSchema = z.looseObject({
  type: z.string().optional(),
  logical_units: z.looseObject({ logical_unit: z.array(LogicalUnitSchema).optional() }).optional(),
})

export type LunStorage = z.infer<typeof LunStorageSchema>

// Standalone disk entity as served by the flat GET /disks collection AND the
// single GET /disks/{id} detail read. The General tab renders from these
// fields; scalars arrive as JSON strings on the live engine, hence the
// coercion. Kept as a superset of the flat-list fields so the same schema
// parses both shapes.
export const DiskSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  alias: z.string().optional(),
  description: z.string().optional(),
  comment: z.string().optional(),
  // bytes; the live engine serializes numeric scalars as JSON strings
  provisioned_size: z.coerce.number().optional(),
  actual_size: z.coerce.number().optional(),
  // logical/physical block sizes — engine serializes numeric scalars as strings
  logical_block_size: z.coerce.number().optional(),
  physical_block_size: z.coerce.number().optional(),
  status: z.string().optional(),
  format: z.string().optional(),
  storage_type: z.string().optional(),
  // 'data' | 'iso' | ... — open string, same rationale as vm status
  content_type: z.string().optional(),
  // whether the image is thin-provisioned; boolean-ish on the live engine
  sparse: BooleanishSchema.optional(),
  shareable: BooleanishSchema.optional(),
  bootable: BooleanishSchema.optional(),
  wipe_after_delete: BooleanishSchema.optional(),
  propagate_errors: BooleanishSchema.optional(),
  backup: z.string().optional(),
  // Direct-LUN disks carry their SAN backing here instead of storage_domains;
  // absent on image disks.
  lun_storage: LunStorageSchema.optional(),
  // Linked entities — bare { id, href } without ?follow=, inlined with name
  // once followed. General renders the storage-domain name(s) from these.
  storage_domains: z.looseObject({ storage_domain: z.array(LinkedEntity).optional() }).optional(),
  quota: LinkedEntity.optional(),
  disk_profile: LinkedEntity.optional(),
})

// JSON quirk: the "disk" key is omitted when the list is empty.
export const DiskListSchema = z.looseObject({
  disk: z.array(DiskSchema).optional(),
})

export type Disk = z.infer<typeof DiskSchema>

// The size a disk row/detail should display. An image disk reports
// provisioned_size; a direct-LUN disk has no image, so the engine reports 0 (or
// omits it) and the real size lives on the bound LUN — mirror webadmin's
// LunDisk.getSize() fallback. Shared by the Disks list, the disk General tab
// and the VM Disks tab.
export function diskSizeBytes(
  disk:
    | {
        provisioned_size?: number
        lun_storage?: LunStorage
      }
    | undefined,
): number | undefined {
  if (!disk) return undefined
  if (disk.provisioned_size !== undefined && disk.provisioned_size > 0) {
    return disk.provisioned_size
  }
  const lunSize = disk.lun_storage?.logical_units?.logical_unit?.[0]?.size
  if (lunSize !== undefined && lunSize > 0) return lunSize
  return disk.provisioned_size
}

// Disk profile as served by GET /storagedomains/{id}/diskprofiles — the
// New/Edit disk profile picker's options are storage-domain-scoped (webadmin
// GetDiskProfilesByStorageDomainId). Only id/name are read (the select label
// and the value written back into the disk's disk_profile link).
export const DiskProfileSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
})

// JSON quirk: the "disk_profile" key is omitted when the list is empty.
export const DiskProfileListSchema = z.looseObject({
  disk_profile: z.array(DiskProfileSchema).optional(),
})

export type DiskProfile = z.infer<typeof DiskProfileSchema>

// GET /vms/{id}/diskattachments?follow=disk embeds each disk in its
// attachment; without the follow the "disk" key is a bare href/id stub.
export const DiskAttachmentSchema = z.looseObject({
  id: z.string(),
  bootable: BooleanishSchema.optional(),
  interface: z.string().optional(),
  active: BooleanishSchema.optional(),
  // api-model DiskAttachment.readOnly (Boolean, default false)
  read_only: BooleanishSchema.optional(),
  disk: z
    .looseObject({
      id: z.string().optional(),
      name: z.string().optional(),
      alias: z.string().optional(),
      description: z.string().optional(),
      // bytes; the live engine serializes numeric scalars as JSON strings
      provisioned_size: z.coerce.number().optional(),
      actual_size: z.coerce.number().optional(),
      status: z.string().optional(),
      format: z.string().optional(),
      // 'image' | 'lun' | 'managed_block_storage' — webadmin's
      // Disk::isAllowSnapshot excludes LUN and shareable disks from snapshot
      // and template dialogs, so the followed disk carries both fields.
      storage_type: z.string().optional(),
      shareable: BooleanishSchema.optional(),
      // Direct-LUN backing (absent on image disks) — the VM Disks tab reads
      // the LUN size from it because a LUN disk has no provisioned_size.
      lun_storage: LunStorageSchema.optional(),
      // Bare { id, href } storage-domain links ride inside the followed disk;
      // the Make Template disk-allocation table defaults each Target select to
      // the first one.
      storage_domains: z
        .looseObject({ storage_domain: z.array(LinkedEntity).optional() })
        .optional(),
    })
    .optional(),
})

// JSON quirk: the "disk_attachment" key is omitted when the list is empty.
export const DiskAttachmentListSchema = z.looseObject({
  disk_attachment: z.array(DiskAttachmentSchema).optional(),
})

export type DiskAttachment = z.infer<typeof DiskAttachmentSchema>

// The image-transfer entity POST /imagetransfers mints and GET /imagetransfers/{id}
// polls. `phase` is the state-machine cursor (initializing → transferring →
// finalizing_success → finished_success, plus the paused/cancelled/failure
// branches); kept an open z.string() like `status` because the engine can add
// phases and the client only compares against a known set. proxy_url/transfer_url
// are the imageio endpoints the raw byte PUT targets — bare and absent until the
// transfer reaches `transferring`, so both are optional. `disk` is the bare
// { id, href } link back to the created target disk (never ?follow=-ed — an
// optional link 500s the live engine, so we only ever read its id).
export const ImageTransferSchema = z.looseObject({
  id: z.string(),
  phase: z.string().optional(),
  proxy_url: z.string().optional(),
  transfer_url: z.string().optional(),
  disk: LinkedEntity.optional(),
})

export type ImageTransfer = z.infer<typeof ImageTransferSchema>
