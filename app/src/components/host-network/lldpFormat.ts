import type { LldpElement } from '../../api/schemas/lldp'

// The rendered text of one LLDP element: its properties as "name: value"
// lines (an unnamed property renders just its value). An element with no
// properties yields no lines; LldpDetails shows a placeholder for it.
export function lldpElementLines(element: LldpElement): string[] {
  const properties = element.properties?.property ?? []
  return properties.map((property) =>
    property.name ? `${property.name}: ${property.value ?? ''}` : (property.value ?? ''),
  )
}

// Element heading: the engine's human-readable TLV name, else the raw type
// (plus OUI/subtype for organizationally specific TLVs, type 127).
export function lldpElementTitle(element: LldpElement): string {
  if (element.name) return element.name
  if (element.type === undefined) return 'Unknown TLV'
  if (element.oui !== undefined)
    return element.subtype !== undefined
      ? `TLV ${element.type} (OUI ${element.oui}, subtype ${element.subtype})`
      : `TLV ${element.type} (OUI ${element.oui})`
  return `TLV ${element.type}`
}
