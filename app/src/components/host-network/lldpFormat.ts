import type { LldpElement } from '../../api/schemas/lldp'
import type { useT } from '../../i18n/useT'

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
// (plus OUI/subtype for organizationally specific TLVs, type 127). `t` is the
// caller's useT() so the fallback headings come from the catalog.
export function lldpElementTitle(element: LldpElement, t: ReturnType<typeof useT>): string {
  if (element.name) return element.name
  if (element.type === undefined) return t('hostNics.lldp.unknownTlv')
  if (element.oui !== undefined)
    return element.subtype !== undefined
      ? t('hostNics.lldp.tlvOuiSubtype', {
          type: element.type,
          oui: element.oui,
          subtype: element.subtype,
        })
      : t('hostNics.lldp.tlvOui', { type: element.type, oui: element.oui })
  return t('hostNics.lldp.tlv', { type: element.type })
}
