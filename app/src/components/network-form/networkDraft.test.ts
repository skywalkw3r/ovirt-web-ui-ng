import { describe, expect, it } from 'vitest'
import type { Network } from '../../api/schemas/network'
import {
  attachmentsToApply,
  blankDraft,
  blankSubnetDraft,
  draftToPayload,
  networkToDraft,
  type ClusterAttachChoice,
} from './networkDraft'

describe('networkToDraft', () => {
  it('maps a fully-populated network into a concrete draft', () => {
    const network: Network = {
      id: 'net-01',
      name: 'ovirtmgmt',
      description: 'management',
      comment: 'primary bridge',
      data_center: { id: 'dc-01', name: 'Default' },
      vlan: { id: 100 },
      mtu: 9000,
      stp: true,
      usages: { usage: ['vm', 'management', 'migration'] },
      qos: { id: 'qos-01' },
      port_isolation: true,
    }
    expect(networkToDraft(network)).toEqual({
      name: 'ovirtmgmt',
      description: 'management',
      comment: 'primary bridge',
      dataCenterId: 'dc-01',
      vlanEnabled: true,
      vlan: '100',
      mtu: '9000',
      stp: true,
      // no dns_resolver_configuration on the read → empty string
      dnsServers: '',
      vmNetwork: true,
      otherUsages: ['management', 'migration'],
      qosId: 'qos-01',
      // labels live in a separate subcollection — always blank in the draft
      label: '',
      portIsolation: true,
      // the external branch is create-only — never re-derived from a read
      external: false,
      externalProviderId: '',
      physicalNetworkId: '',
      subnetEnabled: false,
      subnet: blankSubnetDraft(),
    })
  })

  it('collapses every absent optional to a controlled default', () => {
    const network: Network = { id: 'net-02', name: 'bare' }
    expect(networkToDraft(network)).toEqual({
      name: 'bare',
      description: '',
      comment: '',
      dataCenterId: '',
      vlanEnabled: false,
      vlan: '',
      mtu: '',
      stp: false,
      dnsServers: '',
      vmNetwork: false,
      otherUsages: [],
      qosId: '',
      label: '',
      portIsolation: false,
      external: false,
      externalProviderId: '',
      physicalNetworkId: '',
      subnetEnabled: false,
      subnet: { name: '', cidr: '', ipVersion: 'v4', gateway: '', dnsServers: '' },
    })
  })

  it('treats vlan id 0 as a real tag but mtu 0 as unset', () => {
    const network: Network = { id: 'net-03', name: 'edge', vlan: { id: 0 }, mtu: 0 }
    const draft = networkToDraft(network)
    expect(draft.vlanEnabled).toBe(true)
    expect(draft.vlan).toBe('0')
    expect(draft.mtu).toBe('')
  })

  it('joins dns_resolver_configuration name servers into a comma-separated field', () => {
    // dns_resolver_configuration is not typed on NetworkSchema (it rides the
    // looseObject passthrough), so build the read model with a cast — the same
    // wrapped { name_servers: { name_server: [...] } } shape the live engine
    // serializes.
    const network = {
      id: 'net-04',
      name: 'dns-net',
      dns_resolver_configuration: { name_servers: { name_server: ['8.8.8.8', '1.1.1.1'] } },
    } as unknown as Network
    expect(networkToDraft(network).dnsServers).toBe('8.8.8.8, 1.1.1.1')
  })

  it('leaves dnsServers empty when the resolver config or its list is absent', () => {
    const empty = { id: 'net-05', name: 'n', dns_resolver_configuration: {} } as unknown as Network
    expect(networkToDraft(empty).dnsServers).toBe('')
    expect(networkToDraft({ id: 'net-06', name: 'n2' }).dnsServers).toBe('')
  })
})

describe('draftToPayload', () => {
  it('preserves non-vm usages and only toggles vm on the create body', () => {
    const draft = {
      ...blankDraft(),
      name: 'storage',
      dataCenterId: 'dc-01',
      vmNetwork: false,
      otherUsages: ['migration', 'management'],
    }
    const payload = draftToPayload(draft, false)
    expect(payload.usages).toEqual({ usage: ['migration', 'management'] })
    expect(payload.data_center).toEqual({ id: 'dc-01' })
  })

  it('appends vm to the preserved usages when the VM-network switch is on', () => {
    const draft = { ...blankDraft(), name: 'vmnet', vmNetwork: true, otherUsages: ['management'] }
    expect(draftToPayload(draft, true).usages).toEqual({ usage: ['management', 'vm'] })
  })

  it('omits data_center on edit (a network DC is fixed after creation)', () => {
    const draft = { ...blankDraft(), name: 'edit', dataCenterId: 'dc-01' }
    expect(draftToPayload(draft, true).data_center).toBeUndefined()
  })

  it('rides vlan only when tagging is enabled and mtu only when non-zero', () => {
    const off = { ...blankDraft(), name: 'n', vlanEnabled: false, vlan: '100', mtu: '0' }
    const offPayload = draftToPayload(off, false)
    expect(offPayload.vlan).toBeUndefined()
    expect(offPayload.mtu).toBeUndefined()

    const on = { ...blankDraft(), name: 'n', vlanEnabled: true, vlan: '100', mtu: '9000' }
    const onPayload = draftToPayload(on, false)
    expect(onPayload.vlan).toEqual({ id: 100 })
    expect(onPayload.mtu).toBe(9000)
  })

  it('binds qos as a bare { id } link only when a profile is chosen on create', () => {
    expect(draftToPayload({ ...blankDraft(), name: 'n', qosId: '' }, false).qos).toBeUndefined()
    expect(draftToPayload({ ...blankDraft(), name: 'n', qosId: 'qos-01' }, false).qos).toEqual({
      id: 'qos-01',
    })
  })

  it('sends an explicit empty qos on edit when cleared so the PUT unbinds it', () => {
    // NetworkMapper nulls the entity's qos id only when the key is PRESENT with
    // no id (createGuidFromString(null) → null); omitting would silently keep
    // the old binding — see the draftToPayload comment.
    expect(draftToPayload({ ...blankDraft(), name: 'n', qosId: '' }, true).qos).toEqual({})
    expect(draftToPayload({ ...blankDraft(), name: 'n', qosId: 'qos-01' }, true).qos).toEqual({
      id: 'qos-01',
    })
    // the external branch never carries qos, even the clear
    expect(
      draftToPayload(
        { ...blankDraft(), name: 'n', external: true, externalProviderId: 'onp-01', qosId: '' },
        false,
      ),
    ).not.toHaveProperty('qos')
  })

  it('never leaks the label or cluster choices into the network body', () => {
    const payload = draftToPayload({ ...blankDraft(), name: 'n', label: 'prod' }, false)
    expect(payload).not.toHaveProperty('label')
    expect(payload).not.toHaveProperty('network_label')
  })

  it('rides port_isolation only on a non-external create, and only when set', () => {
    expect(
      draftToPayload({ ...blankDraft(), name: 'n', portIsolation: true }, false).port_isolation,
    ).toBe(true)
    // engine default (false) is expressed by omission, not by sending false
    expect(draftToPayload({ ...blankDraft(), name: 'n' }, false)).not.toHaveProperty(
      'port_isolation',
    )
    // edit never sends it — the modal doesn't offer it post-create
    expect(
      draftToPayload({ ...blankDraft(), name: 'n', portIsolation: true }, true),
    ).not.toHaveProperty('port_isolation')
    // the external branch never sends it — the engine rejects isolation there
    expect(
      draftToPayload(
        {
          ...blankDraft(),
          name: 'n',
          external: true,
          externalProviderId: 'onp-01',
          portIsolation: true,
        },
        false,
      ),
    ).not.toHaveProperty('port_isolation')
  })

  it('sends the comment on both create and edit (empty clears it)', () => {
    expect(draftToPayload({ ...blankDraft(), name: 'n', comment: 'note' }, false).comment).toBe(
      'note',
    )
    expect(draftToPayload({ ...blankDraft(), name: 'n', comment: 'note' }, true).comment).toBe(
      'note',
    )
    expect(draftToPayload({ ...blankDraft(), name: 'n' }, false).comment).toBe('')
  })

  it('sends stp on the non-external branch (create and edit) and drops it on external', () => {
    expect(draftToPayload({ ...blankDraft(), name: 'n', stp: true }, false).stp).toBe(true)
    expect(draftToPayload({ ...blankDraft(), name: 'n', stp: true }, true).stp).toBe(true)
    // the engine default (false) still rides explicitly so an edit can turn it off
    expect(draftToPayload({ ...blankDraft(), name: 'n', stp: false }, true).stp).toBe(false)
    // external networks have no host bridge → stp is dropped
    expect(
      draftToPayload(
        { ...blankDraft(), name: 'n', external: true, externalProviderId: 'onp-01', stp: true },
        false,
      ),
    ).not.toHaveProperty('stp')
  })

  it('comma-splits dns servers into the wrapped name_servers list', () => {
    const payload = draftToPayload(
      { ...blankDraft(), name: 'n', dnsServers: '8.8.8.8, 1.1.1.1 ,,2.2.2.2' },
      false,
    )
    expect(payload.dns_resolver_configuration).toEqual({
      name_servers: { name_server: ['8.8.8.8', '1.1.1.1', '2.2.2.2'] },
    })
  })

  it('omits dns on an empty create but sends an empty list on edit so it can be cleared', () => {
    expect(
      draftToPayload({ ...blankDraft(), name: 'n', dnsServers: '' }, false),
    ).not.toHaveProperty('dns_resolver_configuration')
    expect(
      draftToPayload({ ...blankDraft(), name: 'n', dnsServers: '   ' }, true)
        .dns_resolver_configuration,
    ).toEqual({ name_servers: { name_server: [] } })
  })

  it('drops dns on the external branch (external DNS lives on the provider subnet)', () => {
    expect(
      draftToPayload(
        {
          ...blankDraft(),
          name: 'n',
          external: true,
          externalProviderId: 'onp-01',
          dnsServers: '8.8.8.8',
        },
        false,
      ),
    ).not.toHaveProperty('dns_resolver_configuration')
  })

  it('maps the external branch: provider link rides, host-bridge fields do not', () => {
    const payload = draftToPayload(
      {
        ...blankDraft(),
        name: 'ovn-net',
        dataCenterId: 'dc-01',
        external: true,
        externalProviderId: 'onp-01',
        // stale values a user set before flipping the switch must not ride
        vlanEnabled: true,
        vlan: '100',
        qosId: 'qos-01',
      },
      false,
    )
    expect(payload.external_provider).toEqual({ id: 'onp-01' })
    expect(payload.data_center).toEqual({ id: 'dc-01' })
    // external networks are always VM networks (the modal forces the switch)
    expect(payload.usages).toEqual({ usage: ['vm'] })
    expect(payload).not.toHaveProperty('vlan')
    expect(payload).not.toHaveProperty('qos')
    expect(payload).not.toHaveProperty('external_provider_physical_network')
  })

  it('binds the physical network as a bare { id } link only when chosen', () => {
    const withPhysical = draftToPayload(
      {
        ...blankDraft(),
        name: 'ovn-net',
        external: true,
        externalProviderId: 'onp-01',
        physicalNetworkId: 'net-02',
      },
      false,
    )
    expect(withPhysical.external_provider_physical_network).toEqual({ id: 'net-02' })
  })

  it('ignores the external branch entirely on edit (provider binding is immutable)', () => {
    const payload = draftToPayload(
      { ...blankDraft(), name: 'n', external: true, externalProviderId: 'onp-01' },
      true,
    )
    expect(payload).not.toHaveProperty('external_provider')
  })

  it('never leaks the subnet draft into the network body', () => {
    const payload = draftToPayload(
      {
        ...blankDraft(),
        name: 'ovn-net',
        external: true,
        externalProviderId: 'onp-01',
        subnetEnabled: true,
        subnet: {
          name: 'sub',
          cidr: '10.0.0.0/24',
          ipVersion: 'v4',
          gateway: '10.0.0.1',
          dnsServers: '8.8.8.8',
        },
      },
      false,
    )
    expect(payload).not.toHaveProperty('subnet')
    expect(payload).not.toHaveProperty('cidr')
    expect(payload).not.toHaveProperty('ip_version')
  })
})

describe('attachmentsToApply', () => {
  const choice = (over: Partial<ClusterAttachChoice>): ClusterAttachChoice => ({
    clusterId: 'cluster-01',
    clusterName: 'Default',
    attach: false,
    required: false,
    ...over,
  })

  it('returns only the ticked clusters with their required flag', () => {
    const choices = [
      choice({ clusterId: 'c1', attach: true, required: true }),
      choice({ clusterId: 'c2', attach: false, required: true }),
      choice({ clusterId: 'c3', attach: true, required: false }),
    ]
    expect(attachmentsToApply(choices)).toEqual([
      { clusterId: 'c1', required: true },
      { clusterId: 'c3', required: false },
    ])
  })

  it('is empty when nothing is attached', () => {
    expect(attachmentsToApply([choice({ attach: false })])).toEqual([])
  })
})
