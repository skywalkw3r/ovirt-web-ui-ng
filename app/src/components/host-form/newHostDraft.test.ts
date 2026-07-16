import { describe, expect, it } from 'vitest'
import {
  blankNewHostDraft,
  draftToAddSpec,
  newHostAddressError,
  newHostNameError,
  newHostSshPortError,
  type NewHostDraft,
} from './newHostDraft'

// A submittable draft: the blank defaults plus the three required fields the
// modal gates Save on. Tests override single fields from here so each case
// reads as "blank draft except …".
function filledDraft(overrides: Partial<NewHostDraft> = {}): NewHostDraft {
  return {
    ...blankNewHostDraft(),
    name: 'node-04',
    address: 'node-04.lab.local',
    clusterId: 'cluster-01',
    rootPassword: 'fixture-password',
    ...overrides,
  }
}

describe('newHostNameError', () => {
  it('stays silent on the untouched (empty) field — Save gating handles required', () => {
    expect(newHostNameError('')).toBeUndefined()
  })

  it('accepts hostname-style names with dots, hyphens and underscores', () => {
    expect(newHostNameError('node-04.lab_1')).toBeUndefined()
    expect(newHostNameError('a'.repeat(255))).toBeUndefined()
  })

  it('rejects names over 255 characters', () => {
    expect(newHostNameError('a'.repeat(256))).toBe('hostForm.validation.maxLength255')
  })

  it('rejects characters outside the hostname alphabet', () => {
    expect(newHostNameError('node 04')).toBeDefined()
    expect(newHostNameError('node#04')).toBeDefined()
  })
})

describe('newHostAddressError', () => {
  it('stays silent on the untouched (empty) field', () => {
    expect(newHostAddressError('')).toBeUndefined()
    expect(newHostAddressError('   ')).toBeUndefined()
  })

  it('accepts FQDNs and bare hostnames, trimming surrounding whitespace', () => {
    expect(newHostAddressError('node-04.lab.local')).toBeUndefined()
    expect(newHostAddressError('node04')).toBeUndefined()
    expect(newHostAddressError('  node-04.lab.local  ')).toBeUndefined()
  })

  it('accepts IPv4 addresses', () => {
    expect(newHostAddressError('192.168.122.15')).toBeUndefined()
    expect(newHostAddressError('10.0.0.255')).toBeUndefined()
  })

  it('accepts standard and compressed IPv6 addresses', () => {
    expect(newHostAddressError('2001:db8:0:0:0:0:2:1')).toBeUndefined()
    expect(newHostAddressError('2001:db8::2:1')).toBeUndefined()
    expect(newHostAddressError('fe80::1')).toBeUndefined()
    expect(newHostAddressError('::1')).toBeUndefined()
  })

  it('rejects malformed addresses that match neither FQDN nor IP form', () => {
    expect(newHostAddressError('node_04.lab.local')).toBe('hostForm.validation.address')
    expect(newHostAddressError('-bad.lab.local')).toBeDefined()
    expect(newHostAddressError('a..b')).toBeDefined()
    expect(newHostAddressError('fe80::1::2')).toBeDefined()
  })

  it('accepts out-of-range dotted quads as FQDNs — engine parity, not a bug', () => {
    // '300.1.1.1' fails the IPv4 pattern but every label is a valid DNS
    // label, so the composed FQDN|IPv4|IPv6 rule (like the engine's
    // HostAddressValidation) accepts it as a hostname.
    expect(newHostAddressError('300.1.1.1')).toBeUndefined()
  })

  it('rejects addresses over 255 characters even when well-formed', () => {
    const long = Array.from({ length: 4 }, () => 'a'.repeat(63)).join('.') // 255 chars — fine
    expect(newHostAddressError(long)).toBeUndefined()
    expect(newHostAddressError(`a.${long}`)).toBe('hostForm.validation.maxLength255')
  })
})

describe('newHostSshPortError', () => {
  it('accepts in-range ports, trimming surrounding whitespace', () => {
    expect(newHostSshPortError('22')).toBeUndefined()
    expect(newHostSshPortError('1')).toBeUndefined()
    expect(newHostSshPortError('65535')).toBeUndefined()
    expect(newHostSshPortError(' 2222 ')).toBeUndefined()
  })

  it('errors on blank — the field has a default, so blank means actively emptied', () => {
    expect(newHostSshPortError('')).toBe('hostForm.validation.portRequired')
    expect(newHostSshPortError('   ')).toBeDefined()
  })

  it('rejects out-of-range and non-integer values', () => {
    expect(newHostSshPortError('0')).toBeDefined()
    expect(newHostSshPortError('65536')).toBeDefined()
    expect(newHostSshPortError('-1')).toBeDefined()
    expect(newHostSshPortError('22.5')).toBeDefined()
    expect(newHostSshPortError('ssh')).toBeDefined()
  })
})

describe('draftToAddSpec', () => {
  it('maps an untouched draft to the bare spec — PM, SPM, comment and tabs all omitted', () => {
    // Exact equality is the point: anything extra here would ride the POST
    // and stomp an engine-side default.
    expect(draftToAddSpec(filledDraft())).toEqual({
      name: 'node-04',
      address: 'node-04.lab.local',
      clusterId: 'cluster-01',
      sshPort: 22,
      authMethod: 'password',
      rootPassword: 'fixture-password',
      activateAfterInstall: true,
      rebootAfterInstall: true,
    })
  })

  it('trims the address and coerces the SSH port to a number', () => {
    const spec = draftToAddSpec(filledDraft({ address: '  node-04.lab.local ', sshPort: ' 2222 ' }))
    expect(spec.address).toBe('node-04.lab.local')
    expect(spec.sshPort).toBe(2222)
  })

  it('never carries a password for publickey auth — not even an undefined key', () => {
    const spec = draftToAddSpec(filledDraft({ authMethod: 'publickey' }))
    expect(spec.authMethod).toBe('publickey')
    expect(spec).not.toHaveProperty('rootPassword')
    expect(JSON.stringify(spec)).not.toContain('fixture-password')
  })

  it('sends power management only when a PM flag moved off the blank values', () => {
    const enabled = draftToAddSpec(filledDraft({ pmEnabled: true }))
    expect(enabled.powerManagement).toEqual({
      enabled: true,
      kdumpDetection: true,
      automaticPm: true,
    })
    // a sub-flag move alone also counts as touching the section
    const kdumpOff = draftToAddSpec(filledDraft({ kdumpDetection: false }))
    expect(kdumpOff.powerManagement).toEqual({
      enabled: false,
      kdumpDetection: false,
      automaticPm: true,
    })
  })

  it('sends SPM priority only when moved off the Normal default', () => {
    expect(draftToAddSpec(filledDraft({ spmPriority: 8 })).spmPriority).toBe(8)
    expect(draftToAddSpec(filledDraft({ spmPriority: 5 }))).not.toHaveProperty('spmPriority')
  })

  it('sends the console address only when the override switch is on AND non-blank', () => {
    const on = draftToAddSpec(
      filledDraft({ consoleAddressEnabled: true, consoleAddress: ' console.lab.local ' }),
    )
    expect(on.consoleAddress).toBe('console.lab.local')
    // switch on, nothing typed — nothing to override with
    expect(
      draftToAddSpec(filledDraft({ consoleAddressEnabled: true, consoleAddress: '  ' })),
    ).not.toHaveProperty('consoleAddress')
    // typed but switched back off — off means "use the host address"
    expect(draftToAddSpec(filledDraft({ consoleAddress: 'console.lab.local' }))).not.toHaveProperty(
      'consoleAddress',
    )
  })

  it('sends the kernel cmdline and hosted-engine deploy only when set', () => {
    const touched = draftToAddSpec(
      filledDraft({ kernelCmdline: ' intel_iommu=on ', deployHostedEngine: true }),
    )
    expect(touched.kernelCmdline).toBe('intel_iommu=on')
    expect(touched.deployHostedEngine).toBe(true)
  })
})
