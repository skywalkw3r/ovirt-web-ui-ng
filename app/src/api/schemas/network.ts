import { z } from 'zod'

// Linked entities the engine returns as bare { id, href } unless the read uses
// ?follow=; getNetwork follows data_center so its name is present. Same
// pattern as schemas/vm.ts.
const LinkedEntity = z.looseObject({ id: z.string().optional(), name: z.string().optional() })

export const NetworkSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  comment: z.string().optional(),
  status: z.string().optional(),
  // the live engine serializes the VLAN tag as a JSON string
  vlan: z.looseObject({ id: z.coerce.number().optional() }).optional(),
  // bare { id, href } without ?follow=, inlined with name once followed —
  // the General tab renders the data center name from this
  data_center: LinkedEntity.optional(),
  // bytes; serialized as a JSON string by the live engine ("mtu": "1500")
  mtu: z.coerce.number().optional(),
  // booleans ride as JSON strings ("true"/"false") on the live engine
  stp: z.union([z.boolean(), z.stringbool()]).optional(),
  port_isolation: z.union([z.boolean(), z.stringbool()]).optional(),
  profile_required: z.union([z.boolean(), z.stringbool()]).optional(),
  required: z.union([z.boolean(), z.stringbool()]).optional(),
  // the host-side bridge name VDSM assigns (differs from name when the
  // network name is not a valid bridge identifier)
  vdsm_name: z.string().optional(),
  // network roles: { usage: ['vm', 'management', …] } — key omitted when none
  usages: z.looseObject({ usage: z.array(z.string()).optional() }).optional(),
  // The network-level QoS binding (Network.qos, @Link Qos). The engine
  // serializes it as a bare { id } link; the option list comes from the owning
  // data center's /datacenters/{id}/qoss collection, so any name resolves
  // client-side. Absent when no QoS is set.
  qos: z.looseObject({ id: z.string().optional() }).optional(),
  // Network.display — deprecated on the wire in favor of usages.display, but
  // still serialized as a boolean; carried on the per-cluster attachment shape.
  // Rides as a JSON string on the live engine, so coerce both forms.
  display: z.union([z.boolean(), z.stringbool()]).optional(),
  // Present when this network object is being read as a CLUSTER attachment
  // (GET /clusters/{id}/networks): the engine echoes the network with a bare
  // { id } cluster link plus the attachment's required/display/usages. Absent
  // on the plain /networks read.
  cluster: LinkedEntity.optional(),
  // set only on provider-supplied (external) networks; the engine serializes
  // it as a bare { id } link (restapi NetworkMapper only sets the id), so any
  // display name must join against the providers inventory client-side
  external_provider: LinkedEntity.optional(),
  // external networks only: the data-center network the provider network maps
  // onto (Network.externalProviderPhysicalNetwork, a @Link Network) — a bare
  // { id } link like external_provider. Absent on pure overlay networks.
  external_provider_physical_network: LinkedEntity.optional(),
})

// JSON quirk: the "network" key is omitted when the list is empty.
export const NetworkListSchema = z.looseObject({
  network: z.array(NetworkSchema).optional(),
})

export type Network = z.infer<typeof NetworkSchema>
