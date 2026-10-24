import { z } from 'zod'

// the live engine serializes booleans as strings ("true"/"false")
const BooleanishSchema = z.union([z.boolean(), z.stringbool()])

export const NicSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  // NicInterface enum on the wire (virtio/e1000e/rtl8139/…) — the card model
  // the Type column renders and the modal edits. Kept a loose string so an
  // unmodeled enum value survives round-tripping.
  interface: z.string().optional(),
  plugged: BooleanishSchema.optional(),
  linked: BooleanishSchema.optional(),
  mac: z.looseObject({ address: z.string().optional() }).optional(),
  // bare { id } link back to the vNIC profile — the Profile/Network columns
  // resolve its (and the profile's network's) name client-side against the
  // vnic-profiles + networks caches, and the edit modal prefills from it
  vnic_profile: z.looseObject({ id: z.string().optional() }).optional(),
})

// JSON quirk: the "nic" key is omitted when the list is empty.
export const NicListSchema = z.looseObject({
  nic: z.array(NicSchema).optional(),
})

export type Nic = z.infer<typeof NicSchema>
