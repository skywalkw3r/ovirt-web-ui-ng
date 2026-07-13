import { describe, expect, it } from 'vitest'
import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import {
  attachedActiveDomains,
  attachedDomains,
  clustersInDataCenter,
  deriveClusterGuide,
  deriveDataCenterGuide,
  hostsInCluster,
  hostsInClusters,
  isHostUp,
  type GuideStep,
} from './guideSteps'

// Minimal read-model builders — only the fields the derivation reads. The real
// schemas are loose objects, so the casts stand in for the parsed shapes.
const dc = (id: string, over: Partial<DataCenter> = {}): DataCenter =>
  ({ id, name: id, ...over }) as DataCenter
const cluster = (id: string, dataCenterId?: string, over: Partial<Cluster> = {}): Cluster =>
  ({
    id,
    name: id,
    data_center: dataCenterId ? { id: dataCenterId } : undefined,
    ...over,
  }) as Cluster
const host = (id: string, clusterId: string, status = 'up'): Host =>
  ({ id, name: id, status, cluster: { id: clusterId } }) as Host
const sd = (
  id: string,
  type: 'data' | 'iso',
  dataCenterId: string | undefined,
  status?: string,
): StorageDomain =>
  ({
    id,
    name: id,
    type,
    status,
    data_centers: dataCenterId ? { data_center: [{ id: dataCenterId }] } : undefined,
  }) as StorageDomain

const byId = (steps: GuideStep[], id: string) => {
  const step = steps.find((candidate) => candidate.id === id)
  if (!step) throw new Error(`no step ${id}`)
  return step
}

describe('predicates', () => {
  it('clustersInDataCenter matches on the data_center link', () => {
    const clusters = [cluster('c1', 'dc1'), cluster('c2', 'dc2'), cluster('c3', 'dc1')]
    expect(clustersInDataCenter(clusters, 'dc1').map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('hostsInClusters filters by the run-on cluster id set', () => {
    const hosts = [host('h1', 'c1'), host('h2', 'c2'), host('h3', 'c1')]
    expect(hostsInClusters(hosts, new Set(['c1'])).map((h) => h.id)).toEqual(['h1', 'h3'])
  })

  it('hostsInCluster matches a single cluster', () => {
    const hosts = [host('h1', 'c1'), host('h2', 'c2')]
    expect(hostsInCluster(hosts, 'c2').map((h) => h.id)).toEqual(['h2'])
  })

  it('isHostUp is case-insensitive and false when status is absent', () => {
    expect(isHostUp(host('h1', 'c1', 'Up'))).toBe(true)
    expect(isHostUp(host('h1', 'c1', 'maintenance'))).toBe(false)
    expect(isHostUp({ id: 'h', name: 'h' } as Host)).toBe(false)
  })

  it('attachedDomains matches type + DC link regardless of status', () => {
    const domains = [
      sd('s1', 'data', 'dc1', 'inactive'),
      sd('s2', 'iso', 'dc1', 'active'),
      sd('s3', 'data', 'dc2', 'active'),
      sd('s4', 'data', undefined),
    ]
    expect(attachedDomains(domains, 'dc1', 'data').map((d) => d.id)).toEqual(['s1'])
    expect(attachedDomains(domains, 'dc1', 'iso').map((d) => d.id)).toEqual(['s2'])
  })

  it('attachedActiveDomains additionally requires Active status', () => {
    const domains = [sd('s1', 'data', 'dc1', 'inactive'), sd('s2', 'data', 'dc1', 'active')]
    expect(attachedActiveDomains(domains, 'dc1', 'data').map((d) => d.id)).toEqual(['s2'])
  })
})

describe('deriveDataCenterGuide', () => {
  it('marks every required step incomplete for an empty data center', () => {
    const steps = deriveDataCenterGuide({
      dataCenter: dc('dc1'),
      clusters: [],
      hosts: [],
      storageDomains: [],
    })
    expect(steps.map((s) => s.id)).toEqual(['clusters', 'hosts', 'data-storage', 'iso-storage'])
    expect(byId(steps, 'clusters').complete).toBe(false)
    expect(byId(steps, 'clusters').action).toEqual({ kind: 'new-cluster' })
    // hosts cannot be added before a cluster exists
    expect(byId(steps, 'hosts').blockedReasonId).toBe('guide.blocked.needCluster')
    // storage cannot attach before an Up host exists
    expect(byId(steps, 'data-storage').blockedReasonId).toBe('guide.blocked.needUpHost')
    expect(byId(steps, 'iso-storage').required).toBe(false)
  })

  it('completes clusters/hosts/data steps and counts satisfying resources', () => {
    const steps = deriveDataCenterGuide({
      dataCenter: dc('dc1'),
      clusters: [cluster('c1', 'dc1'), cluster('c2', 'dc1'), cluster('cX', 'dc2')],
      hosts: [host('h1', 'c1', 'up'), host('h2', 'c2', 'maintenance'), host('hX', 'cX', 'up')],
      storageDomains: [
        sd('data1', 'data', 'dc1', 'active'),
        sd('dataOther', 'data', 'dc2', 'active'),
      ],
    })
    expect(byId(steps, 'clusters').complete).toBe(true)
    expect(byId(steps, 'clusters').count).toBe(2)
    // both cluster hosts count; the dc2 host does not
    expect(byId(steps, 'hosts').complete).toBe(true)
    expect(byId(steps, 'hosts').count).toBe(2)
    expect(byId(steps, 'hosts').blockedReasonId).toBeUndefined()
    // one Up host exists, so the storage step is unblocked
    expect(byId(steps, 'data-storage').complete).toBe(true)
    expect(byId(steps, 'data-storage').count).toBe(1)
    expect(byId(steps, 'data-storage').blockedReasonId).toBeUndefined()
    // ISO remains optional + incomplete
    expect(byId(steps, 'iso-storage').complete).toBe(false)
  })

  it('does not count an attached-but-inactive data domain as complete', () => {
    const steps = deriveDataCenterGuide({
      dataCenter: dc('dc1'),
      clusters: [cluster('c1', 'dc1')],
      hosts: [host('h1', 'c1', 'up')],
      storageDomains: [sd('data1', 'data', 'dc1', 'inactive')],
    })
    expect(byId(steps, 'data-storage').complete).toBe(false)
    expect(byId(steps, 'data-storage').count).toBe(0)
  })

  it('completes the optional ISO step when an ISO domain is attached', () => {
    const steps = deriveDataCenterGuide({
      dataCenter: dc('dc1'),
      clusters: [cluster('c1', 'dc1')],
      hosts: [host('h1', 'c1', 'up')],
      storageDomains: [sd('iso1', 'iso', 'dc1', 'active')],
    })
    expect(byId(steps, 'iso-storage').complete).toBe(true)
    expect(byId(steps, 'iso-storage').count).toBe(1)
  })
})

describe('deriveClusterGuide', () => {
  it('marks host/up-host/storage incomplete for a fresh cluster', () => {
    const steps = deriveClusterGuide({
      cluster: cluster('c1', 'dc1'),
      hosts: [],
      storageDomains: [],
    })
    expect(steps.map((s) => s.id)).toEqual(['hosts', 'up-host', 'data-storage'])
    expect(byId(steps, 'hosts').complete).toBe(false)
    expect(byId(steps, 'up-host').blockedReasonId).toBe('guide.blocked.needHost')
    expect(byId(steps, 'data-storage').action).toEqual({
      kind: 'attach-storage',
      dataCenterId: 'dc1',
      storageKind: 'data',
    })
  })

  it('separates having a host from having an Up host', () => {
    const steps = deriveClusterGuide({
      cluster: cluster('c1', 'dc1'),
      hosts: [host('h1', 'c1', 'maintenance')],
      storageDomains: [sd('data1', 'data', 'dc1', 'active')],
    })
    expect(byId(steps, 'hosts').complete).toBe(true)
    expect(byId(steps, 'hosts').count).toBe(1)
    expect(byId(steps, 'up-host').complete).toBe(false)
    expect(byId(steps, 'up-host').blockedReasonId).toBeUndefined()
    expect(byId(steps, 'data-storage').complete).toBe(true)
  })

  it('blocks the storage step when the cluster has no data center', () => {
    const steps = deriveClusterGuide({
      cluster: cluster('c1', undefined),
      hosts: [host('h1', 'c1', 'up')],
      storageDomains: [sd('data1', 'data', 'dc1', 'active')],
    })
    const storage = byId(steps, 'data-storage')
    expect(storage.complete).toBe(false)
    expect(storage.blockedReasonId).toBe('guide.blocked.noDc')
    expect(storage.action).toEqual({
      kind: 'attach-storage',
      dataCenterId: '',
      storageKind: 'data',
    })
  })
})
