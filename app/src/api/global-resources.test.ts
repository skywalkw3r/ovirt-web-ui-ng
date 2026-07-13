import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWebSocketProxy } from './resources/consoles'
import { listEvents } from './resources/events'
import { listNetworks } from './resources/networks'
import { listStorageDomains } from './resources/storageDomains'
import { listVnicProfiles } from './resources/vnicProfiles'
import { listAllDisks } from './resources/disks'
import { listHosts } from './resources/hosts'
import { listVms } from './resources/vms'
import { listPools } from './resources/pools'
import { listUsers } from './resources/users'
import { listDataCenters } from './resources/datacenters'
import { listClusters } from './resources/clusters'
import { listQuotas } from './resources/quotas'
import { listProviders } from './resources/providers'
import { listErrata } from './resources/errata'
import { listGlusterVolumes } from './resources/volumes'
import { VmPoolListSchema } from './schemas/pool'
import { OvirtUserListSchema } from './schemas/user'
import { DataCenterListSchema } from './schemas/datacenter'
import { ClusterListSchema } from './schemas/cluster'
import { QuotaListSchema } from './schemas/quota'
import {
  ExternalHostProviderListSchema,
  OpenStackNetworkProviderListSchema,
} from './schemas/provider'
import { KatelloErratumListSchema } from './schemas/erratum'
import { GlusterVolumeListSchema } from './schemas/gluster-volume'
import { mockRequest, resetMockVms } from './mock/handlers'
import { clearSessionToken, setSessionToken } from './session'

function mockFetch(status: number, payload?: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

// For the aggregating resources, which issue several requests per call: each
// response answers one fetch, in call order.
function mockFetchSequence(...responses: Array<{ status: number; payload?: unknown }>) {
  const fn = vi.fn()
  for (const { status, payload } of responses) {
    fn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
    })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('listEvents', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /events with the default max of 100', async () => {
    const fetchMock = mockFetch(200, {})
    await listEvents()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/events?max=100')
  })

  it('passes an explicit max through in the request path', async () => {
    const fetchMock = mockFetch(200, {})
    await listEvents({ max: 25 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/events?max=25')
  })

  it('sorts events newest first and coerces string scalars', async () => {
    mockFetch(200, {
      event: [
        { id: 'ev-old', code: '32', severity: 'normal', time: '1750000000000' },
        { id: 'ev-new', code: 61, severity: 'error', time: 1750000120000 },
        { id: 'ev-mid', code: 65, severity: 'warning', time: '1750000060000' },
      ],
    })

    const events = await listEvents()
    expect(events.map((e) => e.id)).toEqual(['ev-new', 'ev-mid', 'ev-old'])
    expect(events[2].time).toBe(1750000000000)
    expect(events[2].code).toBe(32)
  })

  it('handles the empty-list quirk (missing "event" key)', async () => {
    mockFetch(200, {})
    await expect(listEvents()).resolves.toEqual([])
  })
})

describe('listStorageDomains', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /storagedomains?follow=data_centers, coerces byte counts, and inlines the DC', async () => {
    const fetchMock = mockFetch(200, {
      storage_domain: [
        {
          id: 'sd-1',
          name: 'data',
          type: 'data',
          status: 'active',
          available: '1538928476160',
          used: '2859449057280',
          committed: '3408486046720',
          // followed collection inlines the attached DC (name + id) on each row
          data_centers: { data_center: [{ id: 'dc-01', name: 'Default' }] },
        },
        { id: 'sd-2', name: 'iso', type: 'iso', external_status: 'ok' },
      ],
    })

    const domains = await listStorageDomains()
    // follow=data_centers inlines the attached DC so the list-row kebab can
    // resolve the DC-scoped actions' target id (see resources/storageDomains.ts)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/storagedomains?follow=data_centers',
    )
    expect(domains[0].available).toBe(1538928476160)
    expect(domains[0].used).toBe(2859449057280)
    expect(domains[0].committed).toBe(3408486046720)
    expect(domains[0].data_centers?.data_center?.[0]?.id).toBe('dc-01')
    expect(domains[1].status).toBeUndefined()
    expect(domains[1].external_status).toBe('ok')
    // an unattached domain carries no data_centers link
    expect(domains[1].data_centers).toBeUndefined()
  })

  it('narrows with search alongside the data_centers follow', async () => {
    const fetchMock = mockFetch(200, { storage_domain: [] })
    await listStorageDomains({ search: 'name=data*' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/storagedomains?search=name%3Ddata*&follow=data_centers',
    )
  })

  it('retries bare once when the followed collection read 5xxs', async () => {
    // LIVE-ENGINE QUIRK: an unattached domain has no data_centers link, so the
    // followed collection read can 500 — listStorageDomains degrades to a bare
    // read (the list matters more than the inlined DC id). Mirrors listVms.
    const fetchMock = mockFetchSequence(
      { status: 500, payload: { detail: 'cannot follow data_centers' } },
      {
        status: 200,
        payload: { storage_domain: [{ id: 'sd-1', name: 'data', status: 'active' }] },
      },
    )
    const domains = await listStorageDomains()
    expect(domains).toHaveLength(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/storagedomains?follow=data_centers',
    )
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/ovirt-engine/api/storagedomains')
  })

  it('handles the empty-list quirk (missing "storage_domain" key)', async () => {
    mockFetch(200, {})
    await expect(listStorageDomains()).resolves.toEqual([])
  })
})

describe('listNetworks', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /networks and coerces the string VLAN id', async () => {
    const fetchMock = mockFetch(200, {
      network: [
        { id: 'n-1', name: 'ovirtmgmt', description: 'Management Network', status: 'operational' },
        { id: 'n-2', name: 'vm-prod', vlan: { id: '100' }, data_center: { id: 'dc-1' } },
      ],
    })

    const networks = await listNetworks()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/networks')
    expect(networks[0].vlan).toBeUndefined()
    expect(networks[1].vlan?.id).toBe(100)
    expect(networks[1].data_center?.id).toBe('dc-1')
  })

  it('handles the empty-list quirk (missing "network" key)', async () => {
    mockFetch(200, {})
    await expect(listNetworks()).resolves.toEqual([])
  })
})

describe('listVnicProfiles', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vnicprofiles and parses the network link', async () => {
    const fetchMock = mockFetch(200, {
      vnic_profile: [
        { id: 'p-1', name: 'ovirtmgmt', network: { id: 'n-1', href: '/networks/n-1' } },
        { id: 'p-2', name: 'no-network', description: 'profile stub' },
      ],
    })

    const profiles = await listVnicProfiles()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vnicprofiles')
    expect(profiles[0].network?.id).toBe('n-1')
    expect(profiles[1].network).toBeUndefined()
    expect(profiles[1].description).toBe('profile stub')
  })

  it('handles the empty-list quirk (missing "vnic_profile" key)', async () => {
    mockFetch(200, {})
    await expect(listVnicProfiles()).resolves.toEqual([])
  })
})

describe('listAllDisks', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /disks and coerces string byte sizes', async () => {
    const fetchMock = mockFetch(200, {
      disk: [
        {
          id: 'd-1',
          name: 'root',
          provisioned_size: '53687091200',
          actual_size: 24696061952,
          status: 'ok',
          format: 'cow',
          storage_type: 'image',
          content_type: 'data',
        },
        { id: 'd-2' },
      ],
    })

    const disks = await listAllDisks()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/disks')
    expect(disks[0].provisioned_size).toBe(53687091200)
    expect(disks[0].actual_size).toBe(24696061952)
    expect(disks[0].content_type).toBe('data')
    expect(disks[1].name).toBeUndefined()
  })

  it('handles the empty-list quirk (missing "disk" key)', async () => {
    mockFetch(200, {})
    await expect(listAllDisks()).resolves.toEqual([])
  })
})

describe('listHosts', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /hosts and coerces memory and summary counts', async () => {
    const fetchMock = mockFetch(200, {
      host: [
        {
          id: 'h-1',
          name: 'node-01',
          status: 'up',
          address: 'node-01.lab.local',
          memory: '274877906944',
          summary: { active: '5', total: 6 },
        },
        { id: 'h-2', name: 'node-03', status: 'maintenance' },
      ],
    })

    const hosts = await listHosts()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/hosts')
    expect(hosts[0].memory).toBe(274877906944)
    expect(hosts[0].summary?.active).toBe(5)
    expect(hosts[0].summary?.total).toBe(6)
    expect(hosts[1].summary).toBeUndefined()
  })

  it('handles the empty-list quirk (missing "host" key)', async () => {
    mockFetch(200, {})
    await expect(listHosts()).resolves.toEqual([])
  })

  it('adds all_content=true when the caller needs computed properties', async () => {
    const fetchMock = mockFetch(200, {})
    await listHosts({ allContent: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/hosts?all_content=true')
  })
})

describe('listPools', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vmpools and coerces the string size', async () => {
    const fetchMock = mockFetch(200, {
      vm_pool: [
        { id: 'p-1', name: 'dev-pool', description: 'scratch VMs', size: '5', vm: { id: 'vm-9' } },
        { id: 'p-2', name: 'class-lab', size: 20 },
      ],
    })

    const pools = await listPools()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vmpools')
    expect(pools[0].size).toBe(5)
    expect(pools[0].vm?.id).toBe('vm-9')
    expect(pools[1].size).toBe(20)
    expect(pools[1].vm).toBeUndefined()
  })

  it('handles the empty-list quirk (missing "vm_pool" key)', async () => {
    mockFetch(200, {})
    await expect(listPools()).resolves.toEqual([])
  })
})

describe('listUsers', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /users and parses identity fields with the domain link', async () => {
    const fetchMock = mockFetch(200, {
      user: [
        {
          id: 'u-1',
          user_name: 'jdoe@ldap.corp',
          name: 'Jane',
          last_name: 'Doe',
          email: 'jane.doe@corp.example',
          domain: { name: 'ldap.corp' },
        },
        { id: 'u-2', user_name: 'admin@internal' },
      ],
    })

    const users = await listUsers()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/users')
    expect(users[0].last_name).toBe('Doe')
    expect(users[0].domain?.name).toBe('ldap.corp')
    expect(users[1].domain).toBeUndefined()
    expect(users[1].email).toBeUndefined()
  })

  it('handles the empty-list quirk (missing "user" key)', async () => {
    mockFetch(200, {})
    await expect(listUsers()).resolves.toEqual([])
  })
})

describe('listDataCenters', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /datacenters and parses status plus storage format', async () => {
    const fetchMock = mockFetch(200, {
      data_center: [
        { id: 'dc-1', name: 'Default', status: 'up', storage_format: 'v5' },
        { id: 'dc-2', name: 'edge', description: 'edge site' },
      ],
    })

    const dataCenters = await listDataCenters()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/datacenters')
    expect(dataCenters[0].status).toBe('up')
    expect(dataCenters[0].storage_format).toBe('v5')
    expect(dataCenters[1].status).toBeUndefined()
    expect(dataCenters[1].description).toBe('edge site')
  })

  it('handles the empty-list quirk (missing "data_center" key)', async () => {
    mockFetch(200, {})
    await expect(listDataCenters()).resolves.toEqual([])
  })
})

describe('listClusters (admin metadata)', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('parses the cpu type and coerces string version parts', async () => {
    mockFetch(200, {
      cluster: [
        {
          id: 'c-1',
          name: 'Default',
          cpu: { type: 'Secure Intel Cascadelake Server Family' },
          version: { major: '4', minor: '7' },
        },
        { id: 'c-2', name: 'bare' },
      ],
    })

    const clusters = await listClusters()
    expect(clusters[0].cpu?.type).toBe('Secure Intel Cascadelake Server Family')
    expect(clusters[0].version?.major).toBe(4)
    expect(clusters[0].version?.minor).toBe(7)
    expect(clusters[1].cpu).toBeUndefined()
    expect(clusters[1].version).toBeUndefined()
  })
})

describe('listQuotas', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('flattens the per-data-center subcollections into one list', async () => {
    const fetchMock = mockFetchSequence(
      {
        status: 200,
        payload: {
          data_center: [
            { id: 'dc-1', name: 'Default' },
            { id: 'dc-2', name: 'edge' },
          ],
        },
      },
      {
        status: 200,
        payload: {
          quota: [
            { id: 'q-1', name: 'Default', data_center: { id: 'dc-1' } },
            { id: 'q-2', name: 'dev-quota', description: 'dev cap', data_center: { id: 'dc-1' } },
          ],
        },
      },
      { status: 200, payload: { quota: [{ id: 'q-3', name: 'edge-quota' }] } },
    )

    const quotas = await listQuotas()
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/ovirt-engine/api/datacenters',
      '/ovirt-engine/api/datacenters/dc-1/quotas',
      '/ovirt-engine/api/datacenters/dc-2/quotas',
    ])
    expect(quotas.map((q) => q.id)).toEqual(['q-1', 'q-2', 'q-3'])
    expect(quotas[1].description).toBe('dev cap')
    expect(quotas[1].data_center?.id).toBe('dc-1')
    expect(quotas[2].data_center).toBeUndefined()
  })

  it('treats a per-DC 404 as an empty subcollection', async () => {
    mockFetchSequence(
      {
        status: 200,
        payload: {
          data_center: [
            { id: 'dc-1', name: 'Default' },
            { id: 'dc-2', name: 'edge' },
          ],
        },
      },
      { status: 404, payload: { fault: { reason: 'Not Found' } } },
      { status: 200, payload: { quota: [{ id: 'q-3', name: 'edge-quota' }] } },
    )
    await expect(listQuotas()).resolves.toMatchObject([{ id: 'q-3' }])
  })

  it('rethrows non-404 per-DC errors', async () => {
    mockFetchSequence(
      { status: 200, payload: { data_center: [{ id: 'dc-1', name: 'Default' }] } },
      { status: 500, payload: { fault: { reason: 'Internal Server Error' } } },
    )
    await expect(listQuotas()).rejects.toMatchObject({ status: 500 })
  })
})

describe('listProviders', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  // listProviders fetches the four typed collections in this fixed order.
  const PROVIDER_ENDPOINTS = [
    '/ovirt-engine/api/externalhostproviders',
    '/ovirt-engine/api/openstackimageproviders',
    '/ovirt-engine/api/openstacknetworkproviders',
    '/ovirt-engine/api/openstackvolumeproviders',
  ]

  it('aggregates the four typed collections and tags each provider with its type', async () => {
    const fetchMock = mockFetchSequence(
      {
        status: 200,
        payload: {
          external_host_provider: [
            { id: 'ehp-1', name: 'foreman.lab.local', url: 'https://foreman.lab.local' },
          ],
        },
      },
      {
        status: 200,
        payload: {
          openstack_image_provider: [{ id: 'oip-1', name: 'glance.lab.local' }],
        },
      },
      {
        status: 200,
        payload: {
          openstack_network_provider: [
            { id: 'onp-1', name: 'ovirt-provider-ovn', description: 'OVN' },
          ],
        },
      },
      {
        status: 200,
        payload: {
          openstack_volume_provider: [{ id: 'ovp-1', name: 'cinder.lab.local' }],
        },
      },
    )

    const providers = await listProviders()
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(PROVIDER_ENDPOINTS)
    expect(providers).toEqual([
      {
        id: 'ehp-1',
        name: 'foreman.lab.local',
        url: 'https://foreman.lab.local',
        providerType: 'host',
      },
      { id: 'oip-1', name: 'glance.lab.local', providerType: 'image' },
      { id: 'onp-1', name: 'ovirt-provider-ovn', description: 'OVN', providerType: 'network' },
      { id: 'ovp-1', name: 'cinder.lab.local', providerType: 'volume' },
    ])
  })

  it('tolerates a 404 from a collection the engine lacks', async () => {
    mockFetchSequence(
      { status: 404 },
      { status: 404 },
      {
        status: 200,
        payload: { openstack_network_provider: [{ id: 'onp-1', name: 'ovirt-provider-ovn' }] },
      },
      { status: 404 },
    )
    const providers = await listProviders()
    expect(providers).toHaveLength(1)
    expect(providers[0].providerType).toBe('network')
  })

  // Contract changed 2026-07: a single collection answering 5xx is treated
  // like the 404 case above ("this engine has no such kind" — OLVM 4.5
  // answers 400/500 for the removed Cinder/Glance kinds) so one dead endpoint
  // no longer blanks the whole Providers page. Auth errors and all-collections
  // -failed still reject — see resources/providers.test.ts for those paths.
  it('tolerates a 5xx from a single collection and returns the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetchSequence(
      { status: 200, payload: {} },
      { status: 503, payload: { fault: { reason: 'Service Unavailable' } } },
      {
        status: 200,
        payload: { openstack_network_provider: [{ id: 'onp-1', name: 'ovirt-provider-ovn' }] },
      },
      { status: 200, payload: {} },
    )
    const providers = await listProviders()
    expect(providers).toHaveLength(1)
    expect(providers[0].providerType).toBe('network')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('handles the empty-list quirk on every collection', async () => {
    mockFetchSequence(
      { status: 200, payload: {} },
      { status: 200, payload: {} },
      { status: 200, payload: {} },
      { status: 200, payload: {} },
    )
    await expect(listProviders()).resolves.toEqual([])
  })
})

describe('listErrata', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /katelloerrata and coerces the issued timestamp', async () => {
    const fetchMock = mockFetch(200, {
      katello_erratum: [
        {
          id: 'err-1',
          title: 'Important: kernel security update',
          name: 'RHSA-2026:1234',
          type: 'security',
          severity: 'important',
          issued: '1750000000000',
        },
        { id: 'err-2' },
      ],
    })

    const errata = await listErrata()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/katelloerrata')
    expect(errata[0].issued).toBe(1750000000000)
    expect(errata[0].severity).toBe('important')
    expect(errata[0].type).toBe('security')
    expect(errata[1].title).toBeUndefined()
  })

  it('handles the empty-list quirk (missing "katello_erratum" key)', async () => {
    mockFetch(200, {})
    await expect(listErrata()).resolves.toEqual([])
  })
})

describe('listGlusterVolumes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('flattens the per-cluster subcollections and tolerates virt-only 404s', async () => {
    const fetchMock = mockFetchSequence(
      {
        status: 200,
        payload: {
          cluster: [
            { id: 'c-1', name: 'Default' },
            { id: 'c-2', name: 'lab-nested' },
          ],
        },
      },
      { status: 404, payload: { fault: { reason: 'Not Found' } } },
      {
        status: 200,
        payload: {
          gluster_volume: [
            {
              id: 'gv-1',
              name: 'gv-data',
              volume_type: 'replicate',
              status: 'up',
              cluster: { id: 'c-2' },
            },
          ],
        },
      },
    )

    const volumes = await listGlusterVolumes()
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/ovirt-engine/api/clusters',
      '/ovirt-engine/api/clusters/c-1/glustervolumes',
      '/ovirt-engine/api/clusters/c-2/glustervolumes',
    ])
    expect(volumes).toHaveLength(1)
    expect(volumes[0]).toMatchObject({
      name: 'gv-data',
      volume_type: 'replicate',
      status: 'up',
      cluster: { id: 'c-2' },
    })
  })

  it('rethrows non-404 per-cluster errors', async () => {
    mockFetchSequence(
      { status: 200, payload: { cluster: [{ id: 'c-1', name: 'Default' }] } },
      { status: 500 },
    )
    await expect(listGlusterVolumes()).rejects.toMatchObject({ status: 500 })
  })
})

describe('mock global resources', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // Every mock response sits behind a short latency timer; settle it without
  // reaching the multi-second state-transition timers.
  async function call(path: string): Promise<unknown> {
    const promise = mockRequest(path, { method: 'GET' })
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('serves events with mixed severities and VM references', async () => {
    const { event } = (await call('/events?max=100')) as {
      event: Array<{ severity?: string; vm?: { name?: string } }>
    }
    expect(event.length).toBeGreaterThanOrEqual(15)
    const severities = new Set(event.map((e) => e.severity))
    expect(severities).toEqual(new Set(['normal', 'warning', 'error', 'alert']))
    expect(event.some((e) => e.vm?.name === 'web-01')).toBe(true)
  })

  it('serves five storage domains (incl. export and block domains), one with string byte counts', async () => {
    const { storage_domain } = (await call('/storagedomains')) as {
      storage_domain: Array<{
        name: string
        type?: string
        available?: number | string
        storage?: { type?: string }
      }>
    }
    // sd-01..sd-05, sd-06 (the live-shape attached domain: no flat status,
    // status only on the followed data_center entry — exercises the list
    // StatusCell's attachment fallback), plus the image/Glance domain that
    // backs the disk Export-to-Glance target picker (wave-6). Containment
    // assertions below track the fixture rather than pinning the count.
    expect(storage_domain.length).toBeGreaterThanOrEqual(7)
    expect(storage_domain.some((sd) => typeof sd.available === 'string')).toBe(true)
    // sd-04 backs the VM import wizard's export-domain source picker
    expect(storage_domain.some((sd) => sd.type === 'export')).toBe(true)
    // sd-05 is the block-backed domain the Refresh LUNs gate needs
    expect(storage_domain.some((sd) => sd.storage?.type === 'iscsi')).toBe(true)
    // the image-type (Glance) domain the disk export target picker filters to
    expect(storage_domain.some((sd) => sd.type === 'image')).toBe(true)
  })

  it('serves ovirtmgmt plus two VLAN networks', async () => {
    const { network } = (await call('/networks')) as {
      network: Array<{ name: string; vlan?: { id?: number | string } }>
    }
    expect(network).toHaveLength(3)
    expect(network[0].name).toBe('ovirtmgmt')
    expect(network.filter((n) => n.vlan?.id !== undefined)).toHaveLength(2)
  })

  it('serves four vNIC profiles spanning every fixture network', async () => {
    const { vnic_profile } = (await call('/vnicprofiles')) as {
      vnic_profile: Array<{ name: string; network?: { id?: string } }>
    }
    expect(vnic_profile).toHaveLength(4)
    const networkIds = new Set(vnic_profile.map((p) => p.network?.id))
    expect(networkIds).toEqual(new Set(['net-01', 'net-02', 'net-03']))
  })

  it('serves every attached disk plus the two unattached ones', async () => {
    const { disk } = (await call('/disks')) as {
      disk: Array<{ name?: string; actual_size?: number | string; content_type?: string }>
    }
    // 13 disks ride the per-VM attachment fixtures (including the shareable
    // quorum disk and the direct LUN), 2 are unattached
    expect(disk).toHaveLength(15)
    const names = disk.map((d) => d.name)
    expect(names).toContain('db-01_pgdata')
    expect(names).toContain('db-cluster_quorum')
    expect(names).toContain('legacy-erp_san')
    expect(names).toContain('iso-uploads')
    expect(names).toContain('orphaned-backup')
    expect(disk.some((d) => typeof d.actual_size === 'string')).toBe(true)
    expect(disk.some((d) => d.content_type === 'iso')).toBe(true)
  })

  it('serves the virt hosts plus the gluster brick nodes', async () => {
    const { host } = (await call('/hosts')) as {
      host: Array<{
        name: string
        status?: string
        memory?: number | string
        summary?: { active?: number | string; total?: number | string }
      }>
    }
    // node-01..03 are the virt hosts; gnode-01..03 back the gluster fixtures.
    // Containment, not full-list equality: the behaviour under test is that the
    // aggregate spans both the virt and gluster host sets plus the scalar
    // coercions below; pinning the exact 6-name list only restated the fixture.
    expect(host.map((h) => h.name)).toEqual(
      expect.arrayContaining(['node-01', 'node-03', 'gnode-01', 'gnode-03']),
    )
    expect(host.slice(0, 3).map((h) => h.status)).toEqual(['up', 'up', 'maintenance'])
    expect(host.some((h) => typeof h.memory === 'string')).toBe(true)
    expect(host.some((h) => typeof h.summary?.active === 'string')).toBe(true)
  })

  // The remaining fixtures run through their zod schemas so the mock shapes
  // and the parsers can never drift apart.

  it('serves two pools whose sizes coerce through VmPoolListSchema', async () => {
    const { vm_pool: pools = [] } = VmPoolListSchema.parse(await call('/vmpools'))
    expect(pools.map((p) => p.name)).toEqual(['dev-pool', 'class-lab'])
    // class-lab's size rides as a string in the fixture; the schema coerces
    expect(pools.map((p) => p.size)).toEqual([5, 20])
  })

  it('serves five users spanning the internal and ldap.corp domains', async () => {
    const { user: users = [] } = OvirtUserListSchema.parse(await call('/users'))
    expect(users).toHaveLength(5)
    const principals = users.map((u) => u.user_name)
    expect(principals).toContain('admin@internal')
    expect(principals).toContain('demo@internal')
    const domains = new Set(users.map((u) => u.domain?.name))
    expect(domains).toEqual(new Set(['internal', 'ldap.corp']))
  })

  it('serves the Default data center with v5 storage format', async () => {
    const { data_center: dataCenters = [] } = DataCenterListSchema.parse(await call('/datacenters'))
    expect(dataCenters).toHaveLength(1)
    expect(dataCenters[0]).toMatchObject({
      name: 'Default',
      status: 'up',
      storage_format: 'v5',
    })
  })

  it('serves two clusters whose cpu type and version parse with coercion', async () => {
    const { cluster: clusters = [] } = ClusterListSchema.parse(await call('/clusters'))
    expect(clusters.map((c) => c.name)).toEqual(['Default', 'lab-nested'])
    for (const cluster of clusters) {
      expect(cluster.cpu?.type).toBe('Secure Intel Cascadelake Server Family')
      // lab-nested's parts ride as strings in the fixture; the schema coerces
      expect(cluster.version?.major).toBe(4)
      expect(cluster.version?.minor).toBe(7)
    }
  })

  it('serves two quotas on the Default data center', async () => {
    const { quota: quotas = [] } = QuotaListSchema.parse(await call('/datacenters/dc-01/quotas'))
    expect(quotas.map((q) => q.name)).toEqual(['Default', 'dev-quota'])
    expect(quotas.every((q) => q.data_center?.id === 'dc-01')).toBe(true)
  })

  it('serves the OVN + Neutron network providers and a Foreman host provider', async () => {
    const { external_host_provider: hostProviders = [] } = ExternalHostProviderListSchema.parse(
      await call('/externalhostproviders'),
    )
    const { openstack_network_provider: networkProviders = [] } =
      OpenStackNetworkProviderListSchema.parse(await call('/openstacknetworkproviders'))
    expect(hostProviders.map((p) => p.name)).toEqual(['foreman.lab.local'])
    // the default OVN provider plus a Neutron provider carrying Identity v3 creds
    expect(networkProviders.map((p) => p.name)).toEqual(['ovirt-provider-ovn', 'neutron.lab.local'])
    const ovn = networkProviders.find((p) => p.name === 'ovirt-provider-ovn')
    expect(ovn?.url).toBe('http://localhost:9696')
    const neutron = networkProviders.find((p) => p.name === 'neutron.lab.local')
    expect(neutron?.user_domain_name).toBe('Default')
    expect(neutron?.project_name).toBe('services')
  })

  it('serves the seeded erratum with detail fields (Satellite integration modeled)', async () => {
    // The fixture models a Satellite-integrated engine so the erratum DETAIL
    // page is demoable in dev:mock; the live no-Satellite degradation (HTTP
    // 400/404) is the resource fn's tolerance path, tested separately below.
    const { katello_erratum: errata = [] } = KatelloErratumListSchema.parse(
      await call('/katelloerrata'),
    )
    expect(errata.length).toBeGreaterThanOrEqual(1)
    expect(errata[0].id).toBe('erratum-01')
    // string-epoch issued coerces to a number
    expect(typeof errata[0].issued).toBe('number')
    // packages live on the DETAIL schema (resources/errata.ts), not the lean
    // list schema — the loose parse still carries them through untyped
    const packages = (errata[0] as { packages?: { package?: unknown[] } }).packages
    expect(packages?.package?.length).toBeGreaterThan(0)
  })

  it('serves gv-data on lab-nested and answers 404 for the virt-only Default', async () => {
    const { gluster_volume: volumes = [] } = GlusterVolumeListSchema.parse(
      await call('/clusters/cluster-02/glustervolumes'),
    )
    // gv-data plus the distributed_replicate fixture that keeps Rebalance
    // reachable in mock
    expect(volumes).toHaveLength(2)
    expect(volumes[0]).toMatchObject({
      name: 'gv-data',
      volume_type: 'replicate',
      status: 'up',
      cluster: { id: 'cluster-02' },
    })

    const promise = mockRequest('/clusters/cluster-01/glustervolumes', { method: 'GET' })
    const rejection = expect(promise).rejects.toMatchObject({ status: 404 })
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })
})

describe('mock VM search (through listVms)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Routes listVms through the transport's mock branch instead of fetch.
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
    resetMockVms()
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  // Settle the mock latency timer without reaching the multi-second
  // state-transition timers.
  async function searchNames(search: string): Promise<string[]> {
    const promise = listVms({ search })
    await vi.advanceTimersByTimeAsync(500)
    return (await promise).map((vm) => vm.name)
  }

  it('name=<glob> with a trailing * matches by prefix', async () => {
    await expect(searchNames('name=web*')).resolves.toEqual(['web-01', 'web-02'])
  })

  it('name=<value> without * requires an exact match', async () => {
    await expect(searchNames('name=web')).resolves.toEqual([])
    await expect(searchNames('name=db-01')).resolves.toEqual(['db-01'])
  })

  it('bare words match name substrings', async () => {
    await expect(searchNames('runner')).resolves.toEqual(['build-runner'])
  })

  it('status=<s> filters on the live status', async () => {
    await expect(searchNames('status=migrating')).resolves.toEqual(['db-02'])
  })

  it('tag=<name> filters through the tag assignment state', async () => {
    await expect(searchNames('tag=web')).resolves.toEqual(['web-01', 'web-02'])
  })

  it("ANDs terms joined by ' and '", async () => {
    await expect(searchNames('name=db* and status=up')).resolves.toEqual(['db-01'])
  })

  it('cluster=<name> filters on the inlined cluster name', async () => {
    // only vm-01 and vm-he inline the cluster NAME; the other Default-cluster
    // fixtures carry an id-only cluster link, which this term ignores
    await expect(searchNames('cluster=Default')).resolves.toEqual(['web-01', 'HostedEngine'])
  })

  it('ignores unknown terms instead of erroring', async () => {
    await expect(searchNames('datacenter=Default and name=web*')).resolves.toEqual([
      'web-01',
      'web-02',
    ])
  })
})

describe('aggregating resources (through the mock engine)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Routes the resources through the transport's mock branch instead of fetch.
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  // The aggregators chain two mock latency hops (parent list, then the
  // per-parent subcollections); 1s settles both without reaching the
  // multi-second state-transition timers.
  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(1_000)
    return promise
  }

  it('listQuotas flattens the per-DC subcollections', async () => {
    const quotas = await settle(listQuotas())
    expect(quotas.map((q) => q.name)).toEqual(['Default', 'dev-quota'])
    expect(quotas.every((q) => q.data_center?.id === 'dc-01')).toBe(true)
  })

  it('listProviders tags the fixtures with their collection of origin', async () => {
    const providers = await settle(listProviders())
    // one seed per typed collection (image/volume/host) plus two network providers
    expect(providers).toHaveLength(5)
    expect(providers.find((p) => p.providerType === 'image')?.name).toBe('glance.lab.local')
    expect(providers.filter((p) => p.providerType === 'network').map((p) => p.name)).toEqual([
      'ovirt-provider-ovn',
      'neutron.lab.local',
    ])
    expect(providers.find((p) => p.providerType === 'volume')?.name).toBe('cinder.lab.local')
    expect(providers.find((p) => p.providerType === 'host')?.name).toBe('foreman.lab.local')
  })

  it('listErrata serves the seeded Satellite erratum through the mock', async () => {
    const errata = await settle(listErrata())
    expect(errata.map((e) => e.id)).toContain('erratum-01')
  })

  it('listGlusterVolumes tolerates the virt-only 404 from Default', async () => {
    const volumes = await settle(listGlusterVolumes())
    expect(volumes).toHaveLength(2)
    expect(volumes[0]).toMatchObject({
      name: 'gv-data',
      volume_type: 'replicate',
      status: 'up',
      cluster: { id: 'cluster-02' },
    })
  })
})

describe('fetchWebSocketProxy (through the mock engine-options route)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('picks the general version row, not row [0] (live engines list version rows first)', async () => {
    await expect(settle(fetchWebSocketProxy())).resolves.toBe('proxy.mock:6100')
  })
})
