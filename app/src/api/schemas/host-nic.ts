import { z } from 'zod'

// A physical host interface (or a bond over them). Distinct from the VM-side
// NicSchema: hosts carry IP/MAC/link-speed/bonding, not a vnic profile.
export const HostNicSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  mac: z.looseObject({ address: z.string().optional() }).optional(),
  ip: z
    .looseObject({
      address: z.string().optional(),
      netmask: z.string().optional(),
      gateway: z.string().optional(),
    })
    .optional(),
  status: z.string().optional(),
  // link speed in bits/s; the live engine serializes numeric scalars as strings
  speed: z.coerce.number().optional(),
  // boot protocol the host actually applied to this NIC (none/dhcp/static) —
  // distinct from an attachment's DC-intended value when a network drifts
  boot_protocol: z.string().optional(),
  // present on a bond master; the engine inlines the mode/options block plus
  // the member NICs under slaves.host_nic (each a bare { id } link)
  bonding: z
    .looseObject({
      slaves: z
        .looseObject({ host_nic: z.array(z.looseObject({ id: z.string() })).optional() })
        .optional(),
    })
    .optional(),
  // NOTE: set on a VLAN device to name its underlying interface — NOT on bond
  // members (a common misread the engine's model bears out). Bond membership
  // is read from a master's bonding.slaves above; see pickableNics.
  base_interface: z.string().optional(),
})

// JSON quirk: the "host_nic" key is omitted when the list is empty.
export const HostNicListSchema = z.looseObject({
  host_nic: z.array(HostNicSchema).optional(),
})

export type HostNic = z.infer<typeof HostNicSchema>
