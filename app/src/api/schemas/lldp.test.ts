import { describe, expect, it } from 'vitest'
import { LldpElementListSchema } from './lldp'

describe('LldpElementListSchema', () => {
  it('parses the api-model example and coerces the string integers', () => {
    const parsed = LldpElementListSchema.parse({
      link_layer_discovery_protocol_element: [
        {
          name: 'Port VLAN Id',
          oui: '32962',
          subtype: '3',
          type: '127',
          properties: {
            property: [
              { name: 'vlan id', value: '488' },
              { name: 'vlan name', value: 'v2-0488-03-0505' },
            ],
          },
        },
        { name: 'Time To Live', type: 3, properties: { property: [{ name: 'TTL', value: 120 }] } },
      ],
    })
    const [vlan, ttl] = parsed.link_layer_discovery_protocol_element ?? []
    expect(vlan).toMatchObject({ name: 'Port VLAN Id', type: 127, oui: 32962, subtype: 3 })
    expect(vlan.properties?.property?.map((p) => p.value)).toEqual(['488', 'v2-0488-03-0505'])
    // a numeric value is kept as text
    expect(ttl.type).toBe(3)
    expect(ttl.properties?.property?.[0].value).toBe('120')
  })

  it('handles the empty-list quirk (missing element key) and propertyless elements', () => {
    expect(LldpElementListSchema.parse({}).link_layer_discovery_protocol_element).toBeUndefined()
    const parsed = LldpElementListSchema.parse({
      link_layer_discovery_protocol_element: [{ name: 'End Of LLDPDU', type: '0', properties: {} }],
    })
    expect(parsed.link_layer_discovery_protocol_element?.[0].properties?.property).toBeUndefined()
  })
})
