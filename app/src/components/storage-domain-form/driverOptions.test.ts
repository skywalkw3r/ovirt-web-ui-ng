import { describe, expect, it } from 'vitest'
import { driverOptionsError, hasNamedRow, toStorageProperties } from './driverOptions'

const row = (id: number, name: string, value: string) => ({ id, name, value })

describe('driverOptionsError', () => {
  it('accepts blank rows and distinct named rows', () => {
    expect(driverOptionsError([])).toBeUndefined()
    expect(driverOptionsError([row(1, '', '')])).toBeUndefined()
    expect(
      driverOptionsError([row(1, 'volume_driver', 'x'), row(2, 'san_ip', '10.0.0.1')]),
    ).toBeUndefined()
  })

  it('rejects a value without a name', () => {
    expect(driverOptionsError([row(1, '  ', 'secret')])).toBe('Each option needs a name.')
  })

  it('rejects duplicate names (trimmed)', () => {
    expect(driverOptionsError([row(1, 'san_ip', 'a'), row(2, ' san_ip ', 'b')])).toBe(
      'Option names must be unique.',
    )
  })
})

describe('hasNamedRow / toStorageProperties', () => {
  it('requires at least one named row', () => {
    expect(hasNamedRow([row(1, '', 'x')])).toBe(false)
    expect(hasNamedRow([row(1, 'volume_driver', '')])).toBe(true)
  })

  it('drops the client-only row id', () => {
    expect(toStorageProperties([row(7, 'san_ip', '10.0.0.1')])).toEqual([
      { name: 'san_ip', value: '10.0.0.1' },
    ])
  })
})
