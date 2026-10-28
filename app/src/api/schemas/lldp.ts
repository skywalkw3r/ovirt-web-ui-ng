import { z } from 'zod'

// One LLDP (IEEE 802.1AB) information element a host NIC received from its
// link partner, as GET /hosts/{host}/nics/{nic}/linklayerdiscoveryprotocolelements
// returns it. Verified against ovirt-engine-api-model
// types/LinkLayerDiscoveryProtocolElement.java (extends Identified, so name /
// description ride too) and services/LinkLayerDiscoveryProtocolService.java:
//   - name: human-readable TLV name (IEEE 802.1AB chapter 8), may repeat
//   - type: the TLV type as an integer (127 = organizationally specific)
//   - oui / subtype: only on type 127 elements
//   - properties.property[]: the TLV payload as name/value pairs
// The live engine serializes the integers as JSON strings, hence the coercion.
export const LldpPropertySchema = z.looseObject({
  name: z.string().optional(),
  // String in the model; a number is accepted defensively and kept as text
  value: z.union([z.string(), z.number().transform(String)]).optional(),
})

export const LldpElementSchema = z.looseObject({
  name: z.string().optional(),
  type: z.coerce.number().optional(),
  oui: z.coerce.number().optional(),
  subtype: z.coerce.number().optional(),
  // JSON quirk: the inner "property" key is omitted when the list is empty
  properties: z.looseObject({ property: z.array(LldpPropertySchema).optional() }).optional(),
})

// JSON quirk: the "link_layer_discovery_protocol_element" key is omitted when
// the NIC reported nothing (no LLDP peer, or LLDP disabled on the switch).
export const LldpElementListSchema = z.looseObject({
  link_layer_discovery_protocol_element: z.array(LldpElementSchema).optional(),
})

export type LldpProperty = z.infer<typeof LldpPropertySchema>
export type LldpElement = z.infer<typeof LldpElementSchema>
