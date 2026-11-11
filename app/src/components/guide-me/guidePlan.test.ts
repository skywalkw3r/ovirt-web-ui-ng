import { describe, expect, it } from 'vitest'
import type { Cluster } from '../../api/schemas/cluster'
import type { DataCenter } from '../../api/schemas/datacenter'
import type { Host } from '../../api/schemas/host'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { clusterGuidePlan, dataCenterGuidePlan, type GuidePlan } from './guidePlan'

// The conditions are webadmin's (uicommonweb DataCenterGuideModel /
// ClusterGuideModel, ovirt-engine 4.5); the cases below walk a data center
// from empty to configured, then the local and cluster variants.

const DC: DataCenter = { id: 'dc', name: 'dc', status: 'uninitialized', storage_format: 'v5' }
const cluster = (id: string, dcId = 'dc', extra: Partial<Cluster> = {}): Cluster => ({
  id,
  name: id,
  data_center: { id: dcId },
  ...extra,
})
const host = (id: string, clusterId: string, status = 'up'): Host => ({
  id,
  name: id,
  status,
  cluster: { id: clusterId },
})
const unattachedData: StorageDomain = {
  id: 'sd-free',
  name: 'free',
  type: 'data',
  external_status: 'ok',
  storage_format: 'v5',
}
const masterData = (dcId = 'dc'): StorageDomain => ({
  id: 'sd-master',
  name: 'master',
  type: 'data',
  status: 'active',
  master: true,
  data_centers: { data_center: [{ id: dcId }] },
})
const isoDomain: StorageDomain = { id: 'sd-iso', name: 'iso', type: 'iso', external_status: 'ok' }

function summary(plan: GuidePlan) {
  return plan.steps.map((s) => ({
    id: s.id,
    label: s.labelId.replace('guideMe.step.', ''),
    required: s.required,
    disabled: s.disabledReasons.map((r) => r.replace('guideMe.reason.', '')),
  }))
}

describe('dataCenterGuidePlan (shared data center)', () => {
  it('an empty data center needs a cluster, a host and storage; host and storage wait', () => {
    const plan = dataCenterGuidePlan({
      dataCenter: DC,
      clusters: [cluster('other', 'elsewhere')],
      hosts: [host('h-other', 'other')],
      storageDomains: [],
      attachedDomains: [],
    })
    expect(plan.configured).toBe(false)
    expect(summary(plan)).toEqual([
      { id: 'cluster', label: 'configureCluster', required: true, disabled: [] },
      { id: 'host', label: 'configureHost', required: true, disabled: ['noCluster'] },
      { id: 'addData', label: 'configureStorage', required: true, disabled: ['noUpHost'] },
      { id: 'attachData', label: 'attachStorage', required: true, disabled: ['noUpHost'] },
      {
        id: 'addIso',
        label: 'configureIsoLibrary',
        required: false,
        disabled: ['noActiveMaster', 'noUpHost'],
      },
      {
        id: 'attachIso',
        label: 'attachIsoLibrary',
        required: false,
        disabled: ['noActiveMaster', 'noUpHost'],
      },
    ])
  })

  it('scopes the steps to the data center and pre-scopes their dialogs', () => {
    const plan = dataCenterGuidePlan({
      dataCenter: DC,
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1')],
      storageDomains: [],
      attachedDomains: [],
    })
    const byId = Object.fromEntries(plan.steps.map((s) => [s.id, s]))
    expect(byId.cluster).toMatchObject({
      labelId: 'guideMe.step.addAnotherCluster',
      required: false,
    })
    expect(byId.cluster.action).toEqual({ kind: 'newCluster', dataCenterId: 'dc' })
    expect(byId.host).toMatchObject({ labelId: 'guideMe.step.addAnotherHost', required: false })
    expect(byId.host.action).toEqual({ kind: 'newHost', clusterId: 'c1' })
    expect(byId.addData.action).toEqual({
      kind: 'newStorageDomain',
      dataCenterId: 'dc',
      local: false,
      domainType: 'data',
      hostName: 'h1',
    })
    // nothing unattached to attach yet
    expect(byId.attachData.disabledReasons).toEqual(['guideMe.reason.noUnattachedData'])
  })

  it('a host that is not Up does not unlock storage', () => {
    const plan = dataCenterGuidePlan({
      dataCenter: DC,
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1', 'installing')],
      storageDomains: [unattachedData],
      attachedDomains: [],
    })
    const host1 = plan.steps.find((s) => s.id === 'host')
    expect(host1?.required).toBe(false)
    expect(plan.steps.find((s) => s.id === 'attachData')?.disabledReasons).toEqual([
      'guideMe.reason.noUpHost',
    ])
  })

  it('an unattached data domain turns Configure Storage optional and enables Attach', () => {
    const plan = dataCenterGuidePlan({
      dataCenter: DC,
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1')],
      storageDomains: [unattachedData, masterData('elsewhere')],
      attachedDomains: [],
    })
    expect(summary(plan).slice(2, 4)).toEqual([
      { id: 'addData', label: 'addMoreStorage', required: false, disabled: [] },
      { id: 'attachData', label: 'attachStorage', required: true, disabled: [] },
    ])
    expect(plan.configured).toBe(false)
  })

  it('skips attach candidates whose format differs once the pool is initialized', () => {
    const plan = dataCenterGuidePlan({
      dataCenter: { ...DC, status: 'up', storage_format: 'v4' },
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1')],
      storageDomains: [unattachedData],
      attachedDomains: [],
    })
    expect(plan.steps.find((s) => s.id === 'attachData')?.disabledReasons).toEqual([
      'guideMe.reason.noUnattachedData',
    ])
  })

  it('an active master domain completes the data center; ISO stays optional', () => {
    const plan = dataCenterGuidePlan({
      dataCenter: { ...DC, status: 'up' },
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1')],
      storageDomains: [masterData(), isoDomain],
      attachedDomains: [masterData()],
    })
    expect(plan.configured).toBe(true)
    expect(summary(plan).filter((s) => s.required)).toEqual([])
    const addIso = plan.steps.find((s) => s.id === 'addIso')
    expect(addIso?.disabledReasons).toEqual([])
    expect(addIso?.action).toMatchObject({ kind: 'newStorageDomain', domainType: 'iso' })
    expect(plan.steps.find((s) => s.id === 'attachIso')?.disabledReasons).toEqual([])
  })

  it('reads the master status off the followed data_centers entry too', () => {
    const liveShape: StorageDomain = {
      ...masterData(),
      status: undefined,
      data_centers: { data_center: [{ id: 'dc', status: 'active' }] },
    }
    const plan = dataCenterGuidePlan({
      dataCenter: { ...DC, status: 'up' },
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1')],
      storageDomains: [liveShape],
      attachedDomains: [liveShape],
    })
    // no ISO domain anywhere: only that reason remains on Attach ISO
    expect(plan.steps.find((s) => s.id === 'attachIso')?.disabledReasons).toEqual([
      'guideMe.reason.noIsoDomain',
    ])
  })

  it('drops the ISO steps once an ISO domain is attached', () => {
    const attachedIso: StorageDomain = {
      ...isoDomain,
      status: 'active',
      data_centers: { data_center: [{ id: 'dc' }] },
    }
    const plan = dataCenterGuidePlan({
      dataCenter: { ...DC, status: 'up' },
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1')],
      storageDomains: [masterData(), attachedIso],
      attachedDomains: [masterData(), attachedIso],
    })
    expect(plan.steps.map((s) => s.id)).toEqual(['cluster', 'host', 'addData', 'attachData'])
  })
})

describe('dataCenterGuidePlan (local data center)', () => {
  const LOCAL: DataCenter = { ...DC, local: true }

  it('asks only for a cluster first', () => {
    const plan = dataCenterGuidePlan({
      dataCenter: LOCAL,
      clusters: [],
      hosts: [],
      storageDomains: [],
      attachedDomains: [],
    })
    expect(summary(plan)).toEqual([
      { id: 'cluster', label: 'configureCluster', required: true, disabled: [] },
    ])
  })

  it('then for its one host, blocked once the pool was initialized', () => {
    const input = { clusters: [cluster('c1')], hosts: [], storageDomains: [], attachedDomains: [] }
    expect(summary(dataCenterGuidePlan({ dataCenter: LOCAL, ...input }))).toEqual([
      { id: 'host', label: 'configureHost', required: true, disabled: [] },
    ])
    expect(
      summary(dataCenterGuidePlan({ dataCenter: { ...LOCAL, status: 'maintenance' }, ...input })),
    ).toEqual([{ id: 'host', label: 'configureHost', required: true, disabled: ['dcInitialized'] }])
  })

  it('with its host, asks for local storage until a data domain is attached', () => {
    const base = { dataCenter: LOCAL, clusters: [cluster('c1')], storageDomains: [] }
    const plan = dataCenterGuidePlan({ ...base, hosts: [host('h1', 'c1')], attachedDomains: [] })
    expect(plan.noteId).toBe('guideMe.note.localStorage')
    expect(summary(plan)).toEqual([
      { id: 'host', label: 'configureHost', required: false, disabled: ['localDcHasHost'] },
      { id: 'localStorage', label: 'addLocalStorage', required: true, disabled: [] },
    ])
    expect(plan.steps[1].action).toEqual({
      kind: 'newStorageDomain',
      dataCenterId: 'dc',
      local: true,
      domainType: 'data',
      hostName: 'h1',
    })
    const down = dataCenterGuidePlan({
      ...base,
      hosts: [host('h1', 'c1', 'maintenance')],
      attachedDomains: [],
    })
    expect(down.steps[1].disabledReasons).toEqual(['guideMe.reason.noUpHost'])
    const done = dataCenterGuidePlan({
      ...base,
      hosts: [host('h1', 'c1')],
      attachedDomains: [masterData()],
    })
    expect(done.configured).toBe(true)
  })
})

describe('clusterGuidePlan', () => {
  const dataCenters: DataCenter[] = [DC, { id: 'ldc', name: 'ldc', local: true }]

  it('asks for a host while the cluster has none', () => {
    const plan = clusterGuidePlan({
      cluster: cluster('c1'),
      dataCenters,
      clusters: [cluster('c1')],
      hosts: [host('h-other', 'c2')],
    })
    expect(summary(plan)).toEqual([
      { id: 'host', label: 'configureHost', required: true, disabled: [] },
    ])
    expect(plan.steps[0].action).toEqual({ kind: 'newHost', clusterId: 'c1' })
  })

  it('is configured with a host, offering another', () => {
    const plan = clusterGuidePlan({
      cluster: cluster('c1'),
      dataCenters,
      clusters: [cluster('c1')],
      hosts: [host('h1', 'c1', 'maintenance')],
    })
    expect(plan.configured).toBe(true)
    expect(summary(plan)).toEqual([
      { id: 'host', label: 'addAnotherHost', required: false, disabled: [] },
    ])
  })

  it('a Gluster cluster offers another host only once one is Up', () => {
    const gluster = cluster('c1', 'dc', { gluster_service: true })
    const input = { cluster: gluster, dataCenters, clusters: [gluster] }
    expect(clusterGuidePlan({ ...input, hosts: [host('h1', 'c1', 'installing')] }).steps).toEqual(
      [],
    )
    expect(clusterGuidePlan({ ...input, hosts: [host('h1', 'c1')] }).steps).toHaveLength(1)
  })

  it('in a local data center, one host anywhere in the DC blocks the step', () => {
    const c1 = cluster('c1', 'ldc')
    const c2 = cluster('c2', 'ldc')
    const plan = clusterGuidePlan({
      cluster: c1,
      dataCenters,
      clusters: [c1, c2],
      hosts: [host('h2', 'c2')],
    })
    expect(plan.configured).toBe(true)
    expect(plan.noteId).toBe('guideMe.note.localStorage')
    expect(summary(plan)).toEqual([
      { id: 'host', label: 'configureHost', required: false, disabled: ['clusterLocalHasHost'] },
    ])
  })

  it('a cluster outside any data center has nothing to offer and is not "configured"', () => {
    const plan = clusterGuidePlan({
      cluster: { id: 'c1', name: 'c1' },
      dataCenters,
      clusters: [],
      hosts: [],
    })
    expect(plan).toEqual({ steps: [], noteId: 'guideMe.note.clusterNoActions', configured: false })
  })
})
