import { z } from 'zod'

// Linked entities ride as bare { id, href } unless the read uses ?follow=;
// listHostNetworkAttachments follows network so its name is present. host_nic
// stays a bare link — the NIC name/id is resolved against the host's own NIC
// list. Same pattern as schemas/network.ts.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

// One boot-protocol/IP block per stack (v4/v6) on an attachment — mirrors
// types/NetworkAttachment.java ip_address_assignments.
export const IpAddressAssignmentSchema = z.looseObject({
  // 'none' | 'dhcp' | 'static' | 'autoconf' | 'poly_dhcp_autoconf'
  assignment_method: z.string().optional(),
  ip: z
    .looseObject({
      address: z.string().optional(),
      netmask: z.string().optional(),
      gateway: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
})

// A logical network attached to a host NIC (GET /hosts/{id}/networkattachments).
export const NetworkAttachmentSchema = z.looseObject({
  id: z.string(),
  network: LinkedEntity.optional(),
  host_nic: LinkedEntity.optional(),
  // false when the host's actual config drifted from the DC definition — the
  // dialog offers "Sync" (synchronized_network_attachments) only then. The
  // live engine serializes booleans as JSON strings.
  in_sync: z.union([z.boolean(), z.stringbool()]).optional(),
  ip_address_assignments: z
    .looseObject({
      ip_address_assignment: z.array(IpAddressAssignmentSchema).optional(),
    })
    .optional(),
  // per-property expected-vs-actual report backing in_sync; rendered raw if at
  // all, so a loose passthrough block suffices
  reported_configurations: z.looseObject({}).optional(),
})

// JSON quirk: the "network_attachment" key is omitted when the list is empty.
export const NetworkAttachmentListSchema = z.looseObject({
  network_attachment: z.array(NetworkAttachmentSchema).optional(),
})

export type NetworkAttachment = z.infer<typeof NetworkAttachmentSchema>
export type IpAddressAssignment = z.infer<typeof IpAddressAssignmentSchema>
