import { createIntl } from 'react-intl'
import { describe, expect, it } from 'vitest'
import { enMessages, type MessageId } from '../../i18n/messages/en'
import { lldpElementLines, lldpElementTitle } from './lldpFormat'

const intl = createIntl({ locale: 'en', messages: enMessages })
const t = (id: MessageId, values?: Record<string, string | number>) =>
  intl.formatMessage({ id }, values)

describe('lldpElementLines', () => {
  it('renders each property as "name: value", unnamed ones as the bare value', () => {
    expect(
      lldpElementLines({
        name: 'Chassis ID',
        properties: {
          property: [
            { name: 'chassis ID', value: '00:1c:73:aa:bb:01' },
            { name: 'chassis ID subtype', value: 'MAC' },
            { value: 'orphan' },
          ],
        },
      }),
    ).toEqual(['chassis ID: 00:1c:73:aa:bb:01', 'chassis ID subtype: MAC', 'orphan'])
  })

  it('yields no lines for an element without properties', () => {
    expect(lldpElementLines({ name: 'End Of LLDPDU', type: 0 })).toEqual([])
  })
})

describe('lldpElementTitle', () => {
  it('prefers the engine name, then falls back to the raw TLV identity', () => {
    expect(lldpElementTitle({ name: 'System Name', type: 5 }, t)).toBe('System Name')
    expect(lldpElementTitle({ type: 5 }, t)).toBe('TLV 5')
    expect(lldpElementTitle({ type: 127, oui: 32962, subtype: 3 }, t)).toBe(
      'TLV 127 (OUI 32962, subtype 3)',
    )
    expect(lldpElementTitle({ type: 127, oui: 32962 }, t)).toBe('TLV 127 (OUI 32962)')
    expect(lldpElementTitle({}, t)).toBe('Unknown TLV')
  })
})
