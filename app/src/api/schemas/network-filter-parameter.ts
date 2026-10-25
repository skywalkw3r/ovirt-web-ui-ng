import { z } from 'zod'

// One network filter parameter on a VM vNIC
// (GET /vms/{vm}/nics/{nic}/networkfilterparameters). Verified against
// ovirt-engine-api-model types/NetworkFilterParameter (extends Identified, so
// id/name ride beside `value`; @since 4.2): `name` is the libvirt nwfilter
// variable (IP, CTRL_IP_LEARNING, DHCPSERVER, ...) and `value` its setting.
// Values are free-form strings, but the live engine can serialize a
// numeric-looking one as a JSON number, so coerce to string.
export const NetworkFilterParameterSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  value: z.coerce.string().optional(),
})

// JSON quirk: the collection wrapper omits the "network_filter_parameter" key
// when the vNIC carries no parameters.
export const NetworkFilterParameterListSchema = z.looseObject({
  network_filter_parameter: z.array(NetworkFilterParameterSchema).optional(),
})

export type NetworkFilterParameter = z.infer<typeof NetworkFilterParameterSchema>
