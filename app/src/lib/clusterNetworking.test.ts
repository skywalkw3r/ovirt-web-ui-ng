import { describe, expect, it } from 'vitest'
import { ClusterSchema } from '../api/schemas/cluster'
import { NetworkSchema, type Network } from '../api/schemas/network'
import type { Provider } from '../api/schemas/provider'
import {
  defaultManagementNetworkId,
  findManagementNetwork,
  managementNetworkCandidates,
  networkProviderOptions,
} from './clusterNetworking'

const net = (raw: Record<string, unknown>): Network => NetworkSchema.parse(raw)

const OVIRTMGMT = net({ id: 'net-01', name: 'ovirtmgmt' })
const VM_PROD = net({ id: 'net-02', name: 'vm-prod', vlan: { id: '20' } })
const OVN = net({ id: 'net-ovn', name: 'ovn-overlay', external_provider: { id: 'onp-01' } })

describe('managementNetworkCandidates', () => {
  it('drops provider-supplied (external) networks, like ManagementNetworkCandidatePredicate', () => {
    expect(managementNetworkCandidates([OVIRTMGMT, OVN, VM_PROD]).map((n) => n.id)).toEqual([
      'net-01',
      'net-02',
    ])
  })
})

describe('defaultManagementNetworkId', () => {
  it('prefers the engine default name (ovirtmgmt) wherever it sits in the list', () => {
    expect(defaultManagementNetworkId([VM_PROD, OVIRTMGMT])).toBe('net-01')
  })

  it('falls back to the only candidate when no network carries the default name', () => {
    expect(defaultManagementNetworkId([VM_PROD])).toBe('net-02')
  })

  it("leaves it to the engine ('') when several candidates and none is ovirtmgmt", () => {
    const storage = net({ id: 'net-03', name: 'storage' })
    expect(defaultManagementNetworkId([VM_PROD, storage])).toBe('')
    expect(defaultManagementNetworkId([])).toBe('')
  })
})

describe('networkProviderOptions', () => {
  it('keeps only the network-type providers (openstack + external network)', () => {
    const providers = [
      { id: 'onp-01', name: 'ovirt-provider-ovn', providerType: 'network' },
      { id: 'ehp-01', name: 'foreman', providerType: 'host' },
      { id: 'oip-01', name: 'glance', providerType: 'image' },
    ] as Provider[]
    expect(networkProviderOptions(providers).map((p) => p.id)).toEqual(['onp-01'])
  })
})

describe('findManagementNetwork', () => {
  const attached = [
    net({ id: 'net-02', name: 'vm-prod', usages: { usage: ['vm'] } }),
    net({ id: 'net-01', name: 'ovirtmgmt', usages: { usage: ['vm', 'management'] } }),
  ]

  it('resolves the read model management_network link by id', () => {
    const cluster = ClusterSchema.parse({
      id: 'c1',
      name: 'prod',
      management_network: { id: 'net-02', href: '/networks/net-02' },
    })
    expect(findManagementNetwork(cluster, attached)?.name).toBe('vm-prod')
  })

  it("falls back to the attachment carrying the 'management' usage", () => {
    const cluster = ClusterSchema.parse({ id: 'c1', name: 'prod' })
    expect(findManagementNetwork(cluster, attached)?.name).toBe('ovirtmgmt')
  })

  it('is undefined when neither rung matches', () => {
    const cluster = ClusterSchema.parse({ id: 'c1', name: 'prod' })
    expect(findManagementNetwork(cluster, [attached[0]])).toBeUndefined()
  })
})
