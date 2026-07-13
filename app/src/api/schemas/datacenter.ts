import { z } from 'zod'

// Linked entities the engine returns as bare { id, href } unless the read uses
// ?follow=; the General tab renders these by name where present. Same pattern
// as schemas/vm.ts and schemas/network.ts.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

export const DataCenterSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  // 'up' | 'maintenance' | 'not_operational' | ... — open string, same
  // rationale as vm status
  status: z.string().optional(),
  // storage format version, e.g. 'v5'
  storage_format: z.string().optional(),
  description: z.string().optional(),
  comment: z.string().optional(),
  // whether this is the local-storage (single-host) data center kind; the
  // live engine serializes booleans as JSON strings ("true"/"false")
  local: z.union([z.boolean(), z.stringbool()]).optional(),
  // compatibility version; the live engine serializes numeric scalars as
  // JSON strings ("major": "4")
  version: z
    .looseObject({
      major: z.coerce.number().optional(),
      minor: z.coerce.number().optional(),
    })
    .optional(),
  supported_versions: z
    .looseObject({
      version: z
        .array(
          z.looseObject({
            major: z.coerce.number().optional(),
            minor: z.coerce.number().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  // MAC address pool the data center draws VM NIC addresses from — a bare
  // { id, href } link; the General tab shows its name once followed.
  mac_pool: LinkedEntity.optional(),
  // quota enforcement mode: 'disabled' | 'audit' | 'enabled'
  quota_mode: z.string().optional(),
})

// JSON quirk: the "data_center" key is omitted when the list is empty.
export const DataCenterListSchema = z.looseObject({
  data_center: z.array(DataCenterSchema).optional(),
})

export type DataCenter = z.infer<typeof DataCenterSchema>
