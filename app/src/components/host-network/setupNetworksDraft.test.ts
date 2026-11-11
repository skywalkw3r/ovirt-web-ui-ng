import { describe, expect, it } from 'vitest'
import type { HostNic } from '../../api/schemas/host-nic'
import type { Network } from '../../api/schemas/network'
import type { NetworkAttachment } from '../../api/schemas/network-attachment'
import type { HostNicDetail } from '../../api/resources/hosts'
import {
  addBondMember,
  addNicLabel,
  bondBlocksSave,
  bondIsModified,
  breakBond,
  createBond,
  customPropertyErrors,
  draftBlocksSave,
  draftHasChanges,
  draftToSpec,
  freeNics,
  hasUnsyncedRows,
  ipv4Error,
  ipv6Error,
  isRowLocked,
  managementGuardError,
  nameServersError,
  netmaskError,
  nextBondName,
  nicLabelsChanged,
  nicLabelsFor,
  pickableNics,
  prefixToNetmask,
  prefixV6Error,
  qosValueError,
  removeBondMember,
  removeNicLabel,
  rowBlocksSave,
  rowFieldErrors,
  rowIsModified,
  seedSetupNetworksDraft,
  setBondMode,
  setNameServers,
  syncAll,
  updateRow,
  validPropertyKeys,
  type SetupNetworksDraft,
} from './setupNetworksDraft'

// ---------------------------------------------------------------------------
// Fixtures — the mock lab's host-01 shape: bond0 (master) + eno1 (member),
// ovirtmgmt static in-sync on bond0, storage dhcp OUT of sync on bond0,
// vm-prod unattached.

const nics: HostNic[] = [
  // bond master naming its member NICs under bonding.slaves (the real engine
  // shape — bond members do NOT carry base_interface)
  { id: 'nic-bond0', name: 'bond0', bonding: { slaves: { host_nic: [{ id: 'nic-eno1' }] } } },
  { id: 'nic-eno1', name: 'eno1' },
  { id: 'nic-eno2', name: 'eno2' },
  // a VLAN sub-interface DOES carry base_interface, and is not an attach target
  { id: 'nic-bond0-v10', name: 'bond0.10', base_interface: 'bond0' },
]

const networks: Network[] = [
  { id: 'net-01', name: 'ovirtmgmt', usages: { usage: ['vm', 'management'] } },
  { id: 'net-02', name: 'vm-prod', vlan: { id: 100 } },
  { id: 'net-03', name: 'storage' },
]

const attachments: NetworkAttachment[] = [
  {
    id: 'att-mgmt',
    network: { id: 'net-01', name: 'ovirtmgmt' },
    host_nic: { id: 'nic-bond0', name: 'bond0' },
    in_sync: true,
    ip_address_assignments: {
      ip_address_assignment: [
        {
          assignment_method: 'static',
          ip: {
            address: '10.0.0.11',
            netmask: '255.255.255.0',
            gateway: '10.0.0.1',
            version: 'v4',
          },
        },
      ],
    },
  },
  {
    id: 'att-storage',
    network: { id: 'net-03', name: 'storage' },
    // bare link — the name resolves against the NIC list
    host_nic: { id: 'nic-bond0' },
    in_sync: false,
    ip_address_assignments: { ip_address_assignment: [{ assignment_method: 'dhcp' }] },
  },
]

function seeded(): SetupNetworksDraft {
  return seedSetupNetworksDraft(networks, attachments, nics)
}

function row(draft: SetupNetworksDraft, networkId: string) {
  const found = draft.rows.find((r) => r.networkId === networkId)
  if (found === undefined) throw new Error(`no row for ${networkId}`)
  return found
}

describe('seedSetupNetworksDraft', () => {
  it('seeds one row per cluster network with attachment state', () => {
    const draft = seeded()
    expect(draft.rows).toHaveLength(3)
    expect(draft.checkConnectivity).toBe(true)
    expect(draft.commitOnSuccess).toBe(true)

    const mgmt = row(draft, 'net-01')
    expect(mgmt.isManagement).toBe(true)
    expect(mgmt.nicName).toBe('bond0')
    expect(mgmt.bootProtocol).toBe('static')
    expect(mgmt.address).toBe('10.0.0.11')
    expect(mgmt.netmask).toBe('255.255.255.0')
    expect(mgmt.gateway).toBe('10.0.0.1')
    expect(mgmt.ipv6BootProtocol).toBe('none')
    expect(mgmt.seed?.attachmentId).toBe('att-mgmt')
    expect(mgmt.seed?.inSync).toBe(true)

    const unattached = row(draft, 'net-02')
    expect(unattached.nicName).toBeNull()
    expect(unattached.seed).toBeUndefined()
    expect(unattached.vlan).toBe(100)
    expect(unattached.bootProtocol).toBe('none')
  })

  it('resolves a bare host_nic id link against the NIC list', () => {
    expect(row(seeded(), 'net-03').nicName).toBe('bond0')
  })

  it('keeps a row for an attachment whose network left the cluster', () => {
    const draft = seedSetupNetworksDraft(
      networks.filter((n) => n.id !== 'net-03'),
      attachments,
      nics,
    )
    const orphan = row(draft, 'net-03')
    expect(orphan.networkName).toBe('storage')
    expect(orphan.nicName).toBe('bond0')
    expect(orphan.seed?.attachmentId).toBe('att-storage')
  })

  it('seeds the bond topology from the host NICs', () => {
    const draft = seeded()
    expect(draft.bonds).toHaveLength(1)
    expect(draft.bonds[0]?.name).toBe('bond0')
    expect(draft.bonds[0]?.slaveNicIds).toEqual(['nic-eno1'])
    expect(draft.bonds[0]?.seed?.id).toBe('nic-bond0')
    expect(draft.bondSeeds).toHaveLength(1)
  })
})

describe('external networks', () => {
  it('are not offered as attach targets (the engine rejects them)', () => {
    const withExternal: Network[] = [
      ...networks,
      { id: 'net-ext', name: 'provider-net', external_provider: { id: 'ovn-1' } },
    ]
    const draft = seedSetupNetworksDraft(withExternal, attachments, nics)
    expect(draft.rows.some((row) => row.networkId === 'net-ext')).toBe(false)
    // the real networks still get their rows
    expect(draft.rows.some((row) => row.networkId === 'net-02')).toBe(true)
  })
})

describe('pickableNics / freeNics / isRowLocked', () => {
  it('excludes bond members, VLAN sub-interfaces and nameless NICs from attach targets', () => {
    // eno1 is a bond member (via bond0.bonding.slaves), bond0.10 a VLAN device,
    // nic-anon nameless — only the bond master and the free NIC remain
    const names = pickableNics([...nics, { id: 'nic-anon' }]).map((nic) => nic.name)
    expect(names).toEqual(['bond0', 'eno2'])
  })

  it('freeNics excludes existing bond masters and draft-bond members', () => {
    const draft = seeded()
    // bond0 is an existing master (excluded), eno1 is its member (excluded),
    // the VLAN device is excluded — only eno2 is a free physical NIC
    expect(freeNics(nics, draft).map((nic) => nic.name)).toEqual(['eno2'])
  })

  it('locks out-of-sync rows until sync is requested', () => {
    const draft = seeded()
    expect(isRowLocked(row(draft, 'net-03'))).toBe(true)
    expect(isRowLocked(row(draft, 'net-01'))).toBe(false)
    expect(isRowLocked(row(draft, 'net-02'))).toBe(false)
    const synced = updateRow(draft, 'net-03', { syncRequested: true })
    expect(isRowLocked(row(synced, 'net-03'))).toBe(false)
  })
})

describe('validation', () => {
  it('flags invalid IPv4 values but stays quiet on empty', () => {
    expect(ipv4Error('')).toBeUndefined()
    expect(ipv4Error('10.0.0.42')).toBeUndefined()
    expect(ipv4Error('256.1.1.1')).toBeDefined()
    expect(ipv4Error('not-an-ip')).toBeDefined()
  })

  it('flags invalid IPv6 values but stays quiet on empty', () => {
    expect(ipv6Error('')).toBeUndefined()
    expect(ipv6Error('2001:db8::1')).toBeUndefined()
    expect(ipv6Error('fe80::1')).toBeUndefined()
    expect(ipv6Error('::1')).toBeUndefined()
    expect(ipv6Error('not-an-ip')).toBeDefined()
    expect(ipv6Error('2001:db8:::1')).toBeDefined()
  })

  it('accepts dotted-quad masks and prefixes, rejects gaps', () => {
    expect(netmaskError('')).toBeUndefined()
    expect(netmaskError('255.255.255.0')).toBeUndefined()
    expect(netmaskError('24')).toBeUndefined()
    expect(netmaskError('255.0.255.0')).toBeDefined()
    expect(netmaskError('0.0.0.0')).toBeDefined()
    expect(netmaskError('33')).toBeDefined()
  })

  it('accepts an IPv6 prefix length 0-128', () => {
    expect(prefixV6Error('')).toBeUndefined()
    expect(prefixV6Error('64')).toBeUndefined()
    expect(prefixV6Error('128')).toBeUndefined()
    expect(prefixV6Error('0')).toBeUndefined()
    expect(prefixV6Error('129')).toBeDefined()
    expect(prefixV6Error('abc')).toBeDefined()
  })

  it('converts prefixes to dotted-quad masks', () => {
    expect(prefixToNetmask(24)).toBe('255.255.255.0')
    expect(prefixToNetmask(16)).toBe('255.255.0.0')
    expect(prefixToNetmask(32)).toBe('255.255.255.255')
    expect(prefixToNetmask(0)).toBe('0.0.0.0')
  })

  it('validates DNS name servers as IPv4 or IPv6, ignoring blanks', () => {
    expect(nameServersError([])).toBeUndefined()
    expect(nameServersError(['8.8.8.8', '2001:db8::1', ''])).toBeUndefined()
    expect(nameServersError(['not-an-ip'])).toBeDefined()
  })

  it('reports per-field errors only for attached static rows', () => {
    const draft = updateRow(seeded(), 'net-01', { address: 'bogus', gateway: '' })
    expect(rowFieldErrors(row(draft, 'net-01')).address).toBeDefined()
    expect(rowFieldErrors(row(draft, 'net-01')).gateway).toBeUndefined()
    // detached and non-static rows never report
    expect(rowFieldErrors(row(seeded(), 'net-02'))).toEqual({})
  })

  it('reports IPv6 static errors on an attached row', () => {
    const draft = updateRow(seeded(), 'net-01', {
      ipv6BootProtocol: 'static',
      ipv6Address: 'bogus',
      ipv6Prefix: '200',
    })
    const errors = rowFieldErrors(row(draft, 'net-01'))
    expect(errors.ipv6Address).toBeDefined()
    expect(errors.ipv6Prefix).toBeDefined()
  })

  it('blocks save on incomplete static config, only for rows that ride', () => {
    // untouched static row: modified=false, nothing blocks
    expect(rowBlocksSave(row(seeded(), 'net-01'), seeded())).toBe(false)
    // re-IP with an empty netmask blocks
    const incomplete = updateRow(seeded(), 'net-01', { address: '10.0.0.99', netmask: '' })
    expect(rowBlocksSave(row(incomplete, 'net-01'), incomplete)).toBe(true)
    expect(draftBlocksSave(incomplete)).toBe(true)
    // complete static config passes; gateway stays optional
    const complete = updateRow(seeded(), 'net-01', { address: '10.0.0.99', gateway: '' })
    expect(rowBlocksSave(row(complete, 'net-01'), complete)).toBe(false)
    expect(draftBlocksSave(complete)).toBe(false)
  })

  it('blocks save on incomplete IPv6 static config', () => {
    const incomplete = updateRow(seeded(), 'net-01', {
      ipv6BootProtocol: 'static',
      ipv6Address: '',
      ipv6Prefix: '64',
    })
    expect(rowBlocksSave(row(incomplete, 'net-01'), incomplete)).toBe(true)
    const complete = updateRow(seeded(), 'net-01', {
      ipv6BootProtocol: 'static',
      ipv6Address: '2001:db8::11',
      ipv6Prefix: '64',
    })
    expect(rowBlocksSave(row(complete, 'net-01'), complete)).toBe(false)
  })

  it('guards the management network against ending up detached', () => {
    expect(managementGuardError(seeded())).toBeUndefined()
    const detached = updateRow(seeded(), 'net-01', { nicName: null })
    // the helper now carries the offending network name as an ICU value the
    // modal resolves through t()
    expect(managementGuardError(detached)?.values.name).toBe('ovirtmgmt')
    expect(draftBlocksSave(detached)).toBe(true)
    // moving it to another NIC in the same action is allowed
    const moved = updateRow(seeded(), 'net-01', { nicName: 'eno2' })
    expect(managementGuardError(moved)).toBeUndefined()
    // a management network that was never attached does not block unrelated work
    const neverAttached = seedSetupNetworksDraft(networks, attachments.slice(1), nics)
    expect(managementGuardError(neverAttached)).toBeUndefined()
  })
})

describe('diff → spec', () => {
  it('produces no changes for an untouched draft', () => {
    const draft = seeded()
    expect(draftHasChanges(draft)).toBe(false)
    expect(draftToSpec(draft)).toEqual({ checkConnectivity: true, commitOnSuccess: true })
  })

  it('emits a fresh attach without an attachment id', () => {
    const draft = updateRow(seeded(), 'net-02', { nicName: 'eno2' })
    expect(draftHasChanges(draft)).toBe(true)
    expect(draftToSpec(draft).modified).toEqual([
      // fresh attach → ipChanged so the engine sets the initial config
      {
        networkId: 'net-02',
        nicName: 'eno2',
        bootProtocol: 'none',
        ipv6BootProtocol: 'none',
        ipChanged: true,
      },
    ])
  })

  it('keeps the seeded attachment id on a move and leaves IP config untouched', () => {
    const draft = updateRow(seeded(), 'net-01', { nicName: 'eno2' })
    expect(draftToSpec(draft).modified).toEqual([
      {
        attachmentId: 'att-mgmt',
        networkId: 'net-01',
        nicName: 'eno2',
        bootProtocol: 'static',
        ipv6BootProtocol: 'none',
        // move-only: IP unchanged, so ipChanged is false and setupHostNetworks
        // omits the assignment block (the engine keeps existing IpConfiguration)
        ipChanged: false,
        ip: { address: '10.0.0.11', netmask: '255.255.255.0', gateway: '10.0.0.1' },
      },
    ])
  })

  it('normalizes a prefix netmask and omits an empty gateway on the wire', () => {
    const draft = updateRow(seeded(), 'net-01', {
      address: '10.0.0.99',
      netmask: '16',
      gateway: '',
    })
    expect(draftToSpec(draft).modified).toEqual([
      {
        attachmentId: 'att-mgmt',
        networkId: 'net-01',
        nicName: 'bond0',
        bootProtocol: 'static',
        ipv6BootProtocol: 'none',
        // static fields changed → ipChanged, config is resent
        ipChanged: true,
        ip: { address: '10.0.0.99', netmask: '255.255.0.0' },
      },
    ])
  })

  it('treats a normalized-equal netmask round-trip as unchanged', () => {
    const draft = updateRow(seeded(), 'net-01', { netmask: '24' })
    expect(rowIsModified(row(draft, 'net-01'))).toBe(false)
    expect(draftHasChanges(draft)).toBe(false)
  })

  it('sends a detach as removed by attachment id, and reattach reuses it', () => {
    const detached = updateRow(seeded(), 'net-03', { nicName: null })
    expect(draftToSpec(detached)).toEqual({
      checkConnectivity: true,
      commitOnSuccess: true,
      removed: ['att-storage'],
    })
    // reattach within the session: modify (id reused), nothing removed
    const reattached = updateRow(detached, 'net-03', { nicName: 'eno2' })
    const spec = draftToSpec(reattached)
    expect(spec.removed).toBeUndefined()
    expect(spec.modified?.[0]?.attachmentId).toBe('att-storage')
  })

  it('emits sync requests by attachment id without forcing a modify', () => {
    const draft = updateRow(seeded(), 'net-03', { syncRequested: true })
    expect(draftHasChanges(draft)).toBe(true)
    expect(draftToSpec(draft)).toEqual({
      checkConnectivity: true,
      commitOnSuccess: true,
      synced: ['att-storage'],
    })
  })

  it('passes the connectivity/commit knobs through', () => {
    const draft = { ...seeded(), checkConnectivity: false, commitOnSuccess: false }
    expect(draftToSpec(draft)).toEqual({ checkConnectivity: false, commitOnSuccess: false })
  })
})

// ---------------------------------------------------------------------------
// IPv6

describe('ipv6', () => {
  const v6Attachment: NetworkAttachment = {
    id: 'att-v6',
    network: { id: 'net-01', name: 'ovirtmgmt' },
    host_nic: { id: 'nic-eno2', name: 'eno2' },
    in_sync: true,
    ip_address_assignments: {
      ip_address_assignment: [
        { assignment_method: 'static', ip: { address: '10.0.0.11', netmask: '24', version: 'v4' } },
        {
          assignment_method: 'static',
          ip: { address: '2001:db8::11', netmask: '64', gateway: '2001:db8::1', version: 'v6' },
        },
      ],
    },
  }

  it('seeds the v6 leg from the versioned assignment', () => {
    const draft = seedSetupNetworksDraft(networks, [v6Attachment], nics)
    const mgmt = row(draft, 'net-01')
    expect(mgmt.ipv6BootProtocol).toBe('static')
    expect(mgmt.ipv6Address).toBe('2001:db8::11')
    expect(mgmt.ipv6Prefix).toBe('64')
    expect(mgmt.ipv6Gateway).toBe('2001:db8::1')
  })

  it('emits both v4 and v6 assignments when the v6 leg is edited', () => {
    const draft = updateRow(seedSetupNetworksDraft(networks, [v6Attachment], nics), 'net-01', {
      ipv6Address: '2001:db8::99',
    })
    const entry = draftToSpec(draft).modified?.[0]
    expect(entry?.ipChanged).toBe(true)
    expect(entry?.ipv6BootProtocol).toBe('static')
    expect(entry?.ipv6).toEqual({ address: '2001:db8::99', netmask: '64', gateway: '2001:db8::1' })
    // the untouched v4 leg still rides so it is not wiped
    expect(entry?.bootProtocol).toBe('static')
    expect(entry?.ip).toEqual({ address: '10.0.0.11', netmask: '255.255.255.0' })
  })

  it('leaves v6 untouched on a move (ipChanged stays false)', () => {
    const draft = updateRow(seedSetupNetworksDraft(networks, [v6Attachment], nics), 'net-01', {
      nicName: 'bond0',
    })
    const entry = draftToSpec(draft).modified?.[0]
    expect(entry?.ipChanged).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// DNS

describe('dns resolver', () => {
  const withDns: NetworkAttachment[] = [
    { ...attachments[0], dns_resolver_configuration: { name_servers: ['10.0.0.1'] } } as never,
    attachments[1],
  ]

  it('seeds name servers from the management attachment', () => {
    const draft = seedSetupNetworksDraft(networks, withDns, nics)
    expect(draft.nameServers).toEqual(['10.0.0.1'])
    expect(draft.nameServersSeed).toEqual(['10.0.0.1'])
  })

  it('stamps changed name servers onto the management attachment as a bare modify', () => {
    const draft = setNameServers(seedSetupNetworksDraft(networks, withDns, nics), [
      '8.8.8.8',
      '8.8.4.4',
    ])
    expect(draftHasChanges(draft)).toBe(true)
    const spec = draftToSpec(draft)
    expect(spec.modified).toHaveLength(1)
    const entry = spec.modified?.[0]
    expect(entry?.networkId).toBe('net-01')
    expect(entry?.attachmentId).toBe('att-mgmt')
    // DNS-only edit does not touch the IP config
    expect(entry?.ipChanged).toBe(false)
    expect(entry?.nameServers).toEqual(['8.8.8.8', '8.8.4.4'])
  })

  it('clears name servers by sending an empty list', () => {
    const draft = setNameServers(seedSetupNetworksDraft(networks, withDns, nics), [])
    const entry = draftToSpec(draft).modified?.[0]
    expect(entry?.nameServers).toEqual([])
  })

  it('folds DNS onto an already-modified management attachment', () => {
    let draft = seedSetupNetworksDraft(networks, withDns, nics)
    draft = updateRow(draft, 'net-01', { address: '10.0.0.50' })
    draft = setNameServers(draft, ['9.9.9.9'])
    const spec = draftToSpec(draft)
    // one entry carries both the IP change and the DNS
    expect(spec.modified).toHaveLength(1)
    expect(spec.modified?.[0]?.ipChanged).toBe(true)
    expect(spec.modified?.[0]?.nameServers).toEqual(['9.9.9.9'])
  })
})

// ---------------------------------------------------------------------------
// Sync All

describe('sync all', () => {
  it('reports and folds every out-of-sync attachment', () => {
    const draft = seeded()
    expect(hasUnsyncedRows(draft)).toBe(true)
    const synced = syncAll(draft)
    expect(hasUnsyncedRows(synced)).toBe(false)
    expect(draftToSpec(synced).synced).toEqual(['att-storage'])
  })

  it('is a no-op when everything is in sync', () => {
    const draft = seedSetupNetworksDraft(networks, [attachments[0]], nics)
    expect(hasUnsyncedRows(draft)).toBe(false)
    expect(draftToSpec(syncAll(draft)).synced).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Bonds

describe('bonds', () => {
  // two free NICs so a fresh bond can be built (eno2 + eno3)
  const bondNics: HostNic[] = [...nics, { id: 'nic-eno3', name: 'eno3' }]

  function freeSeed(): SetupNetworksDraft {
    // a draft with no existing bonds so eno2/eno3 are free
    return seedSetupNetworksDraft(
      networks,
      [],
      bondNics.filter((nic) => nic.id !== 'nic-bond0' && nic.id !== 'nic-eno1'),
    )
  }

  it('names a fresh bond as the lowest free bondN', () => {
    expect(nextBondName(seeded(), nics)).toBe('bond1')
    expect(nextBondName(freeSeed(), [])).toBe('bond0')
  })

  it('creates a bond from free NICs and marks it modified', () => {
    const free = freeSeed()
    const withBond = createBond(free, bondNics, 'bond0', 4, ['nic-eno2', 'nic-eno3'])
    expect(withBond.bonds).toHaveLength(1)
    expect(withBond.bonds[0]?.slaveNicIds).toEqual(['nic-eno2', 'nic-eno3'])
    expect(bondIsModified(withBond.bonds[0])).toBe(true)
    const spec = draftToSpec(withBond)
    expect(spec.modifiedBonds).toEqual([
      { name: 'bond0', mode: 4, slaveNicIds: ['nic-eno2', 'nic-eno3'] },
    ])
    // freeNics no longer offers the folded members
    const stillFree = freeNics(
      bondNics.filter((n) => n.bonding === undefined),
      withBond,
    ).map((nic) => nic.name)
    expect(stillFree).not.toContain('eno2')
    expect(stillFree).not.toContain('eno3')
  })

  it('moves a member NIC attachment onto a new bond', () => {
    const single: HostNic[] = [
      { id: 'nic-a', name: 'ena' },
      { id: 'nic-b', name: 'enb' },
    ]
    let draft = seedSetupNetworksDraft(networks, [], single)
    // attach vm-prod to ena, then bond ena+enb
    draft = updateRow(draft, 'net-02', { nicName: 'ena' })
    draft = createBond(draft, single, 'bond0', 1, ['nic-a', 'nic-b'])
    expect(row(draft, 'net-02').nicName).toBe('bond0')
  })

  it('edits an existing bond mode and members', () => {
    let draft = seeded()
    draft = setBondMode(draft, 'bond0', 4)
    expect(draft.bonds[0]?.mode).toBe(4)
    draft = addBondMember(draft, nics, 'bond0', 'nic-eno2')
    expect(draft.bonds[0]?.slaveNicIds).toContain('nic-eno2')
    expect(bondIsModified(draft.bonds[0])).toBe(true)
    const spec = draftToSpec(draft)
    // an edited existing bond carries its engine id
    expect(spec.modifiedBonds?.[0]?.id).toBe('nic-bond0')
    expect(spec.modifiedBonds?.[0]?.mode).toBe(4)
  })

  it('keeps a bond at two or more members on removal', () => {
    let draft = seeded()
    draft = addBondMember(draft, nics, 'bond0', 'nic-eno2')
    // bond0 now has eno1 + eno2 (2 members); removing drops to 1, so it is a no-op
    const after = removeBondMember(draft, 'bond0', 'nic-eno2')
    expect(after.bonds[0]?.slaveNicIds).toEqual(['nic-eno1', 'nic-eno2'])
  })

  it('flags a modified bond with fewer than two members', () => {
    const free = freeSeed()
    const bad = createBond(free, bondNics, 'bond0', 1, ['nic-eno2'])
    expect(bondBlocksSave(bad.bonds[0])).toBe(true)
    expect(draftBlocksSave(bad)).toBe(true)
  })

  it('breaks a bond: it goes to removed_bonds and its networks unassign', () => {
    // put storage on bond0, then break it
    const draft = breakBond(seeded(), 'bond0')
    expect(draft.bonds).toHaveLength(0)
    // storage (was on bond0) is now unassigned
    expect(row(draft, 'net-03').nicName).toBeNull()
    // management was on bond0 too → now unassigned → guard blocks
    expect(row(draft, 'net-01').nicName).toBeNull()
    const spec = draftToSpec(draft)
    expect(spec.removedBonds).toEqual([{ id: 'nic-bond0', name: 'bond0' }])
  })

  it('an untouched existing bond does not ride or block', () => {
    const draft = seeded()
    expect(draftToSpec(draft).modifiedBonds).toBeUndefined()
    expect(draftToSpec(draft).removedBonds).toBeUndefined()
    // bond0 seed has a single member but is never resent, so it cannot block
    expect(draftBlocksSave(draft)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Host-network QoS override

describe('qos override', () => {
  // the mgmt attachment plus an inline anonymous host-network QoS (upperlimit
  // rides as a JSON string to exercise the seed's string normalization)
  const qosAttachment = {
    id: 'att-mgmt',
    network: { id: 'net-01', name: 'ovirtmgmt' },
    host_nic: { id: 'nic-bond0', name: 'bond0' },
    in_sync: true,
    ip_address_assignments: { ip_address_assignment: [{ assignment_method: 'dhcp' }] },
    qos: {
      type: 'hostnetwork',
      outbound_average_linkshare: 50,
      outbound_average_upperlimit: '1000',
      outbound_average_realtime: 200,
    },
  } as unknown as NetworkAttachment

  function qosSeeded(): SetupNetworksDraft {
    return seedSetupNetworksDraft(networks, [qosAttachment], nics)
  }

  it('seeds the override flag and outbound values from the inline qos', () => {
    const mgmt = row(qosSeeded(), 'net-01')
    expect(mgmt.qosOverride).toBe(true)
    expect(mgmt.qosLinkshare).toBe('50')
    expect(mgmt.qosUpperlimit).toBe('1000')
    expect(mgmt.qosRealtime).toBe('200')
    // an attachment without qos seeds inherit (override off)
    expect(row(seeded(), 'net-01').qosOverride).toBe(false)
  })

  it('is unchanged until an outbound value is edited', () => {
    expect(draftHasChanges(qosSeeded())).toBe(false)
    const edited = updateRow(qosSeeded(), 'net-01', { qosLinkshare: '75' })
    expect(rowIsModified(row(edited, 'net-01'))).toBe(true)
    const entry = draftToSpec(edited).modified?.[0]
    expect(entry?.ipChanged).toBe(false)
    expect(entry?.qos).toEqual({ linkshare: 75, upperlimit: 1000, realtime: 200 })
  })

  it('rides a fresh override on a newly attached network', () => {
    const draft = updateRow(seeded(), 'net-02', {
      nicName: 'eno2',
      qosOverride: true,
      qosUpperlimit: '500',
    })
    const entry = draftToSpec(draft).modified?.find((candidate) => candidate.networkId === 'net-02')
    expect(entry?.qos).toEqual({ upperlimit: 500 })
  })

  it('emits an empty qos block when an override is turned off', () => {
    const draft = updateRow(qosSeeded(), 'net-01', { qosOverride: false })
    expect(draftHasChanges(draft)).toBe(true)
    expect(draftToSpec(draft).modified?.[0]?.qos).toEqual({})
  })

  it('sends no qos at all for an inherit row', () => {
    const draft = updateRow(seeded(), 'net-02', { nicName: 'eno2' })
    const entry = draftToSpec(draft).modified?.find((candidate) => candidate.networkId === 'net-02')
    expect(entry?.qos).toBeUndefined()
  })

  it('validates outbound values and blocks save on a bad one', () => {
    expect(qosValueError('')).toBeUndefined()
    expect(qosValueError('100')).toBeUndefined()
    expect(qosValueError('-1')).toBeDefined()
    expect(qosValueError('1.5')).toBeDefined()
    const bad = updateRow(qosSeeded(), 'net-01', { qosUpperlimit: 'abc' })
    expect(rowFieldErrors(row(bad, 'net-01')).qosUpperlimit).toBeDefined()
    expect(rowBlocksSave(row(bad, 'net-01'), bad)).toBe(true)
    expect(draftBlocksSave(bad)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// NIC labels

describe('nic labels', () => {
  const nicDetails: HostNicDetail[] = [
    { id: 'nic-eno2', name: 'eno2', labels: ['red'], vf: undefined },
  ]

  function labelSeeded(): SetupNetworksDraft {
    return seedSetupNetworksDraft(networks, attachments, nics, nicDetails)
  }

  it('seeds the per-NIC label set from nicDetails', () => {
    const draft = labelSeeded()
    expect(nicLabelsFor(draft, 'nic-eno2')).toEqual(['red'])
    expect(nicLabelsChanged(draft)).toBe(false)
    // a draft seeded without details has no labels but is still valid
    expect(nicLabelsFor(seeded(), 'nic-eno2')).toEqual([])
  })

  it('adds a label into modified_labels with its target NIC', () => {
    const draft = addNicLabel(labelSeeded(), 'nic-eno2', 'eno2', 'green')
    expect(nicLabelsFor(draft, 'nic-eno2')).toEqual(['red', 'green'])
    expect(draftHasChanges(draft)).toBe(true)
    expect(draftToSpec(draft).modifiedLabels).toEqual([
      { label: 'green', nicId: 'nic-eno2', nicName: 'eno2' },
    ])
    expect(draftToSpec(draft).removedLabels).toBeUndefined()
  })

  it('removes a seeded label into removed_labels', () => {
    const draft = removeNicLabel(labelSeeded(), 'nic-eno2', 'red')
    expect(nicLabelsFor(draft, 'nic-eno2')).toEqual([])
    expect(draftToSpec(draft).removedLabels).toEqual(['red'])
    expect(draftToSpec(draft).modifiedLabels).toBeUndefined()
  })

  it('upserts a label on a NIC that carried none', () => {
    const draft = addNicLabel(labelSeeded(), 'nic-eno3', 'eno3', 'purple')
    expect(draftToSpec(draft).modifiedLabels).toContainEqual({
      label: 'purple',
      nicId: 'nic-eno3',
      nicName: 'eno3',
    })
  })

  it('ignores blank and duplicate labels', () => {
    let draft = addNicLabel(labelSeeded(), 'nic-eno2', 'eno2', '   ')
    draft = addNicLabel(draft, 'nic-eno2', 'eno2', 'red')
    expect(nicLabelsFor(draft, 'nic-eno2')).toEqual(['red'])
    expect(nicLabelsChanged(draft)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Attachment custom properties

describe('attachment custom properties', () => {
  // ovirtmgmt (a VM network) carries bridge_opts; storage (not a VM network)
  // carries none
  const withProperties: NetworkAttachment[] = [
    {
      ...attachments[0],
      properties: { property: [{ name: 'bridge_opts', value: 'forward_delay=1500' }] },
    },
    attachments[1],
  ]

  // the engine's shipped PreDefinedNetworkCustomProperties regex plus one
  // admin-defined key
  const definitions = {
    bridge_opts: '^[^\\s=]+=[^\\s=]+(\\s+[^\\s=]+=[^\\s=]+)*$',
    ethtool_opts: '.*',
  }

  function propertySeeded(defs: Record<string, string> | null = null): SetupNetworksDraft {
    return seedSetupNetworksDraft(networks, withProperties, nics, [], defs)
  }

  function errorIds(draft: SetupNetworksDraft, networkId: string) {
    return customPropertyErrors(row(draft, networkId), draft).map((error) => error?.id)
  }

  it('seeds the rows from properties.property and flags VM networks', () => {
    const draft = propertySeeded()
    const mgmt = row(draft, 'net-01')
    expect(mgmt.customProperties).toEqual([{ name: 'bridge_opts', value: 'forward_delay=1500' }])
    expect(mgmt.seed?.customProperties).toEqual(mgmt.customProperties)
    expect(mgmt.isVmNetwork).toBe(true)
    expect(row(draft, 'net-03').customProperties).toEqual([])
    expect(row(draft, 'net-03').isVmNetwork).toBe(false)
    // the definitions default to null (free-form) and are carried when given
    expect(draft.propertyDefinitions).toBeNull()
    expect(propertySeeded(definitions).propertyDefinitions).toEqual(definitions)
  })

  it('treats an attachment whose network left the cluster as bridged', () => {
    const orphan: NetworkAttachment = {
      id: 'att-gone',
      network: { id: 'net-99', name: 'gone' },
      host_nic: { id: 'nic-eno2', name: 'eno2' },
    }
    const draft = seedSetupNetworksDraft(networks, [...attachments, orphan], nics)
    expect(row(draft, 'net-99').isVmNetwork).toBe(true)
  })

  it('leaves untouched properties out of the payload', () => {
    const draft = propertySeeded()
    expect(rowIsModified(row(draft, 'net-01'))).toBe(false)
    expect(draftHasChanges(draft)).toBe(false)
    // an unrelated edit (a move) does not resend them either
    const moved = updateRow(draft, 'net-01', { nicName: 'eno2' })
    expect(draftToSpec(moved).modified?.[0].properties).toBeUndefined()
  })

  it('sends the complete set on a bare modify when a value changes', () => {
    const draft = updateRow(propertySeeded(), 'net-01', {
      customProperties: [
        { name: 'bridge_opts', value: 'forward_delay=1500 multicast_snooping=1' },
        { name: 'ethtool_opts', value: '--offload em1 rx on' },
      ],
    })
    expect(rowIsModified(row(draft, 'net-01'))).toBe(true)
    expect(draftBlocksSave(draft)).toBe(false)
    expect(draftToSpec(draft).modified).toEqual([
      {
        attachmentId: 'att-mgmt',
        networkId: 'net-01',
        nicName: 'bond0',
        bootProtocol: 'static',
        ipv6BootProtocol: 'none',
        // the IP config is left alone: a properties-only edit is a bare modify
        ipChanged: false,
        ip: { address: '10.0.0.11', netmask: '255.255.255.0', gateway: '10.0.0.1' },
        properties: [
          { name: 'bridge_opts', value: 'forward_delay=1500 multicast_snooping=1' },
          { name: 'ethtool_opts', value: '--offload em1 rx on' },
        ],
      },
    ])
  })

  it('sends an empty list to clear a seeded set', () => {
    const draft = updateRow(propertySeeded(), 'net-01', { customProperties: [] })
    expect(draftHasChanges(draft)).toBe(true)
    expect(draftToSpec(draft).modified?.[0].properties).toEqual([])
  })

  it('ignores blank rows, outer padding and row order when diffing', () => {
    const seededTwo = seedSetupNetworksDraft(
      networks,
      [
        {
          ...attachments[0],
          properties: {
            property: [
              { name: 'bridge_opts', value: 'forward_delay=1500' },
              { name: 'ethtool_opts', value: '-K em1 gso off' },
            ],
          },
        },
      ],
      nics,
    )
    const draft = updateRow(seededTwo, 'net-01', {
      customProperties: [
        { name: ' ethtool_opts ', value: ' -K em1 gso off ' },
        { name: '', value: '' },
        { name: 'bridge_opts', value: 'forward_delay=1500' },
      ],
    })
    expect(rowIsModified(row(draft, 'net-01'))).toBe(false)
    expect(draftHasChanges(draft)).toBe(false)
  })

  it('carries properties on a fresh attach only when there are any', () => {
    const plain = updateRow(seeded(), 'net-02', { nicName: 'eno2' })
    expect(draftToSpec(plain).modified?.[0].properties).toBeUndefined()
    const withProps = updateRow(plain, 'net-02', {
      customProperties: [
        { name: 'ethtool_opts', value: '-K em1 gso off' },
        { name: '', value: '' },
      ],
    })
    expect(draftToSpec(withProps).modified?.[0].properties).toEqual([
      { name: 'ethtool_opts', value: '-K em1 gso off' },
    ])
  })

  it('enforces the engine syntax rules in the free-form fallback', () => {
    const draft = updateRow(propertySeeded(), 'net-01', {
      customProperties: [
        { name: 'bridge_opts', value: 'forward_delay=1500' },
        { name: 'bridge_opts', value: 'forward_delay=0' },
        { name: 'bad-key', value: 'x' },
        { name: '', value: 'orphan value' },
        { name: 'some_key', value: 'a;b' },
        { name: 'anything_goes', value: 'not checked without definitions' },
        { name: '', value: '' },
      ],
    })
    expect(validPropertyKeys(row(draft, 'net-01'), draft)).toBeNull()
    expect(errorIds(draft, 'net-01')).toEqual([
      undefined,
      'setupNetworks.validation.customPropertyDuplicate',
      'setupNetworks.validation.customPropertyKey',
      'setupNetworks.validation.customPropertyKeyRequired',
      'setupNetworks.validation.customPropertyValueSyntax',
      undefined,
      undefined,
    ])
    expect(draftBlocksSave(draft)).toBe(true)
  })

  it('rejects bridge_opts on a network that is not a VM network', () => {
    // storage (net-03) has no 'vm' usage; sync it so the row is editable
    const draft = updateRow(propertySeeded(), 'net-03', {
      syncRequested: true,
      customProperties: [{ name: 'bridge_opts', value: 'forward_delay=1500' }],
    })
    expect(customPropertyErrors(row(draft, 'net-03'), draft)).toEqual([
      { id: 'setupNetworks.validation.customPropertyBridgeOpts', values: { key: 'bridge_opts' } },
    ])
    expect(rowBlocksSave(row(draft, 'net-03'), draft)).toBe(true)
  })

  it('limits keys and checks values against the engine definitions', () => {
    const draft = propertySeeded(definitions)
    // the closed key list drops bridge_opts for the non-VM network
    expect(validPropertyKeys(row(draft, 'net-01'), draft)).toEqual(['bridge_opts', 'ethtool_opts'])
    expect(validPropertyKeys(row(draft, 'net-03'), draft)).toEqual(['ethtool_opts'])

    const edited = updateRow(draft, 'net-01', {
      customProperties: [
        // the engine regex wants whitespace-separated key=value pairs
        { name: 'bridge_opts', value: 'forward_delay' },
        { name: 'not_configured', value: 'x' },
        { name: 'ethtool_opts', value: '' },
      ],
    })
    expect(customPropertyErrors(row(edited, 'net-01'), edited)).toEqual([
      {
        id: 'setupNetworks.validation.customPropertyValue',
        values: { key: 'bridge_opts', format: definitions.bridge_opts },
      },
      { id: 'setupNetworks.validation.customPropertyUnknown', values: { key: 'not_configured' } },
      undefined,
    ])
    expect(draftBlocksSave(edited)).toBe(true)

    const valid = updateRow(draft, 'net-01', {
      customProperties: [{ name: 'bridge_opts', value: 'forward_delay=0 multicast_snooping=1' }],
    })
    expect(errorIds(valid, 'net-01')).toEqual([undefined])
    expect(draftBlocksSave(valid)).toBe(false)
  })

  it('skips a definition regex JS cannot compile instead of failing the row', () => {
    // a possessive quantifier is valid Java but not JS
    const draft = updateRow(propertySeeded({ odd_key: 'a++' }), 'net-01', {
      customProperties: [{ name: 'odd_key', value: 'whatever' }],
    })
    expect(errorIds(draft, 'net-01')).toEqual([undefined])
    // unbalanced syntax is skipped the same way, never thrown
    const broken = updateRow(propertySeeded({ odd_key: '([a-z' }), 'net-01', {
      customProperties: [{ name: 'odd_key', value: 'whatever' }],
    })
    expect(errorIds(broken, 'net-01')).toEqual([undefined])
  })

  it('skips Java-only escapes rather than reading them as literals', () => {
    // \p{Alnum} is a Java POSIX class; legacy JS would match the literal text
    // "p{Alnum}" and wrongly fail a value the engine accepts
    const draft = updateRow(propertySeeded({ java_key: '\\p{Alnum}+' }), 'net-01', {
      customProperties: [{ name: 'java_key', value: 'abc123' }],
    })
    expect(errorIds(draft, 'net-01')).toEqual([undefined])
  })

  it('matches the whole value like Java String.matches, alternation included', () => {
    const draft = propertySeeded({ mode: 'on|off' })
    const check = (value: string) =>
      errorIds(
        updateRow(draft, 'net-01', { customProperties: [{ name: 'mode', value }] }),
        'net-01',
      )
    expect(check('on')).toEqual([undefined])
    expect(check('off')).toEqual([undefined])
    // an unanchored test would accept these
    expect(check('only')).toEqual(['setupNetworks.validation.customPropertyValue'])
    expect(check('xoff')).toEqual(['setupNetworks.validation.customPropertyValue'])
  })

  it('keeps the properties with the attachment when it moves onto a new bond', () => {
    // break bond0 (ovirtmgmt parks), bond eno1 + eno2, re-place ovirtmgmt there
    let draft = breakBond(propertySeeded(), 'bond0')
    draft = createBond(draft, nics, 'bond1', 1, ['nic-eno1', 'nic-eno2'])
    draft = updateRow(draft, 'net-01', { nicName: 'bond1' })
    const mgmt = draftToSpec(draft).modified?.find((entry) => entry.networkId === 'net-01')
    // the attachment id is reused and the untouched set is omitted, so the
    // engine keeps it on the moved attachment
    expect(mgmt?.attachmentId).toBe('att-mgmt')
    expect(mgmt?.nicName).toBe('bond1')
    expect(mgmt?.properties).toBeUndefined()
    expect(row(draft, 'net-01').customProperties).toEqual([
      { name: 'bridge_opts', value: 'forward_delay=1500' },
    ])
  })

  it('does not let an untouched, no-longer-valid seeded key block another edit', () => {
    // the engine config no longer lists bridge_opts, but the attachment has it
    const draft = updateRow(propertySeeded({ ethtool_opts: '.*' }), 'net-01', {
      address: '10.0.0.99',
    })
    expect(errorIds(draft, 'net-01')).toEqual(['setupNetworks.validation.customPropertyUnknown'])
    expect(rowBlocksSave(row(draft, 'net-01'), draft)).toBe(false)
    expect(draftToSpec(draft).modified?.[0].properties).toBeUndefined()
  })
})
