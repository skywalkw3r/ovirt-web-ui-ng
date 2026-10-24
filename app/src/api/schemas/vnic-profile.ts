import { z } from 'zod'

export const VnicProfileSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // bare link back to the profile's network — only the id is modeled
  network: z.looseObject({ id: z.string().optional() }).optional(),
  // 'enabled' | 'disabled'; the engine omits the block on records that
  // predate SR-IOV support, and the default is disabled either way
  pass_through: z.looseObject({ mode: z.string().optional() }).optional(),
  port_mirroring: z.union([z.boolean(), z.stringbool()]).optional(),
  // 'if passthrough is false all vnicprofiles are migratable'; rides as a JSON
  // string on the live engine, so coerce the string form too
  migratable: z.union([z.boolean(), z.stringbool()]).optional(),
  // bare id link to the network filter (omitted when unset) — the option list
  // comes from the /networkfilters collection, so names resolve client-side
  network_filter: z.looseObject({ id: z.string().optional() }).optional(),
  // bare id link to the network QoS (omitted when unset) — resolved against the
  // owning data center's /qoss collection, never followed off the profile
  qos: z.looseObject({ id: z.string().optional() }).optional(),
  // bare id link to the failover profile (omitted when unset) — it points at
  // another row of this same collection, so names resolve client-side
  failover: z.looseObject({ id: z.string().optional() }).optional(),
  // key/value device custom properties (api-model VnicProfile.customProperties:
  // CustomProperty[] with name/value/regexp). The wrapper key is omitted when
  // the profile carries none; values are free-form strings but the live engine
  // can serialize numeric-looking ones as JSON numbers, so coerce to string.
  custom_properties: z
    .looseObject({
      custom_property: z
        .array(
          z.looseObject({
            name: z.string().optional(),
            value: z.coerce.string().optional(),
            regexp: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
})

// JSON quirk: the "vnic_profile" key is omitted when the list is empty.
export const VnicProfileListSchema = z.looseObject({
  vnic_profile: z.array(VnicProfileSchema).optional(),
})

export type VnicProfile = z.infer<typeof VnicProfileSchema>

// The global /networkfilters collection: each filter arrives as a full object
// (id + name + a compatibility version block), unlike the bare { id } link the
// filter takes on a profile — so the profile's link resolves by name lookup
// against this cached list. version scalars ride as JSON strings on the live
// engine, hence the coercion.
export const NetworkFilterSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  version: z
    .looseObject({
      major: z.coerce.number().optional(),
      minor: z.coerce.number().optional(),
    })
    .optional(),
})

export const NetworkFilterListSchema = z.looseObject({
  network_filter: z.array(NetworkFilterSchema).optional(),
})

export type NetworkFilter = z.infer<typeof NetworkFilterSchema>
