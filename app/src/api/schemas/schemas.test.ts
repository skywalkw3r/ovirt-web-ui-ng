import { describe, expect, it } from 'vitest'
import { ApiRootSchema } from './system'
import { VmListSchema } from './vm'

describe('ApiRootSchema', () => {
  it('accepts a realistic /api payload with unmodeled fields', () => {
    const parsed = ApiRootSchema.parse({
      product_info: {
        name: 'oVirt Engine',
        vendor: 'ovirt.org',
        version: { full_version: '4.5.7-1.el9', major: '4', minor: '5' },
      },
      special_objects: { blank_template: { id: '00000000' } },
      time: 1719800000000,
    })
    expect(parsed.product_info.name).toBe('oVirt Engine')
    expect(parsed.product_info.version?.full_version).toBe('4.5.7-1.el9')
  })
})

describe('VmListSchema', () => {
  it('parses a populated list and tolerates extra per-VM fields', () => {
    const parsed = VmListSchema.parse({
      vm: [{ id: 'a1', name: 'web-01', status: 'up', memory: 4294967296, bios: {} }],
    })
    expect(parsed.vm).toHaveLength(1)
    expect(parsed.vm?.[0].name).toBe('web-01')
  })

  it('coerces string-valued memory (live engine serializes numbers as strings)', () => {
    const parsed = VmListSchema.parse({
      vm: [{ id: 'a2', name: 'db-01', status: 'up', memory: '4294967296' }],
    })
    expect(parsed.vm?.[0].memory).toBe(4294967296)
  })

  it('handles the empty-list quirk (missing "vm" key)', () => {
    const parsed = VmListSchema.parse({})
    // `vm` is `.optional()` with no default, so a missing key parses to
    // undefined — assert that directly rather than `?? []`, which masked the
    // actual value and would pass even if the schema changed shape.
    expect(parsed.vm).toBeUndefined()
  })
})
