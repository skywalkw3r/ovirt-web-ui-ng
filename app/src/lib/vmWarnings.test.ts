import { describe, expect, it } from 'vitest'
import type { Vm } from '../api/schemas/vm'
import { offsetToMinutes, vmWarningIds } from './vmWarnings'

const vm = (overrides: Partial<Vm>): Vm =>
  ({ id: 'vm-1', name: 'db-01', status: 'up', ...overrides }) as Vm

describe('vmWarningIds', () => {
  it('flags a running guest with no agent heartbeat (no OS, no FQDN)', () => {
    expect(vmWarningIds(vm({}))).toEqual(['vm.warning.guestAgent'])
  })

  it('treats an FQDN or a reported OS as an agent heartbeat', () => {
    expect(vmWarningIds(vm({ fqdn: 'db-01.lab' }))).toEqual([])
    expect(vmWarningIds(vm({ guest_operating_system: { family: 'Linux' } }))).toEqual([])
  })

  it('flags timezone drift by UTC offset, not name', () => {
    const drifted = vm({
      fqdn: 'db-01.lab',
      time_zone: { name: 'Etc/GMT', utc_offset: '+00:00' },
      guest_time_zone: { name: 'America/Denver', utc_offset: '-07:00' },
    })
    expect(vmWarningIds(drifted)).toEqual(['vm.warning.timezone'])
  })

  it('does NOT flag same offset under a different zone name (Etc/GMT vs UTC)', () => {
    const aligned = vm({
      fqdn: 'db-01.lab',
      time_zone: { name: 'Etc/GMT', utc_offset: '+00:00' },
      guest_time_zone: { name: 'UTC', utc_offset: '+00:00' },
    })
    expect(vmWarningIds(aligned)).toEqual([])
  })

  it('never warns when either side has no reported offset', () => {
    const noGuestOffset = vm({
      fqdn: 'db-01.lab',
      time_zone: { name: 'Etc/GMT', utc_offset: '+00:00' },
      guest_time_zone: { name: 'America/Denver' },
    })
    expect(vmWarningIds(noGuestOffset)).toEqual([])
  })

  it('stacks both warnings and stays silent for non-running VMs', () => {
    const both = vm({
      time_zone: { name: 'Etc/GMT', utc_offset: '+00:00' },
      guest_time_zone: { name: 'America/Denver', utc_offset: '-07:00' },
    })
    expect(vmWarningIds(both)).toEqual(['vm.warning.guestAgent', 'vm.warning.timezone'])
    expect(vmWarningIds(vm({ status: 'down' }))).toEqual([])
  })
})

describe('offsetToMinutes', () => {
  it('parses the common utc_offset formats to signed minutes', () => {
    expect(offsetToMinutes('+00:00')).toBe(0)
    expect(offsetToMinutes('-07:00')).toBe(-420)
    expect(offsetToMinutes('-0700')).toBe(-420)
    expect(offsetToMinutes('GMT-05:00')).toBe(-300)
    expect(offsetToMinutes('+5:30')).toBe(330)
  })

  it('returns undefined for absent or unparseable values', () => {
    expect(offsetToMinutes(undefined)).toBeUndefined()
    expect(offsetToMinutes('UTC')).toBeUndefined()
  })
})
