import { describe, expect, it } from 'vitest'
import type { Host } from '../../api/schemas/host'
import type { HostNic } from '../../api/schemas/host-nic'
import { copySourceCandidates, physicalNicCount } from './copyHostNetworks'

const host = (id: string, name: string, clusterId?: string): Host =>
  ({ id, name, cluster: clusterId ? { id: clusterId } : undefined }) as Host

describe('copySourceCandidates', () => {
  const hosts = [
    host('h3', 'node-03', 'c1'),
    host('h1', 'node-01', 'c1'),
    host('h2', 'node-02', 'c1'),
    host('g1', 'gluster-01', 'c2'),
  ]

  it('offers the other hosts of the same cluster, sorted by name, never itself', () => {
    expect(copySourceCandidates(hosts[1], hosts).map((h) => h.id)).toEqual(['h2', 'h3'])
  })

  it('offers nothing when the destination has no cluster link', () => {
    expect(copySourceCandidates(host('hx', 'loose'), hosts)).toEqual([])
  })
})

describe('physicalNicCount', () => {
  it('counts plain NICs and bond members, never bond masters or VLAN devices', () => {
    const nics = [
      { id: 'bond0', name: 'bond0', bonding: { slaves: { host_nic: [{ id: 'eno1' }] } } },
      { id: 'eno1', name: 'eno1' },
      { id: 'eno2', name: 'eno2' },
      { id: 'eno2.100', name: 'eno2.100', vlan: { id: 100 }, base_interface: 'eno2' },
    ] as HostNic[]
    expect(physicalNicCount(nics)).toBe(2)
    expect(physicalNicCount([])).toBe(0)
  })
})
