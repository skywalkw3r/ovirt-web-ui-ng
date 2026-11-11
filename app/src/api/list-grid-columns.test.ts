import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFollowDenials } from './followDegrade'
import { mockRequest, resetMockVms } from './mock/handlers'
import { listAllDataCenterQoss } from './resources/datacenters'
import { listDiskOwnerNames } from './resources/disks'
import { listNetworkLabelTexts } from './resources/networks'
import { listVmsReportedDevices } from './resources/vms'
import { listGlusterVolumes } from './resources/volumes'
import { glusterVolumeCapacity, GlusterVolumeListSchema } from './schemas/gluster-volume'
import { NetworkListSchema } from './schemas/network'
import { VmListSchema } from './schemas/vm'
import { clearSessionToken, setSessionToken } from './session'
import { runningVmCounts } from '../lib/poolRunningVms'

// The list-grid columns that read one followed list or one shared collection
// instead of a per-row fan-out (issue #34): request shapes, parsing, and the
// sticky follow-denial degrade.

type Route = { status: number; payload?: unknown }

// Answers each fetch by its path (minus the API prefix), so parallel legs
// (Promise.all / allSettled fan-outs) resolve independently of call order.
// A route given as an array answers its entries in turn (last one repeats).
function routeFetch(routes: Record<string, Route | Route[]>) {
  const counts = new Map<string, number>()
  const fn = vi.fn((url: string) => {
    const path = url.replace('/ovirt-engine/api', '')
    const entry = routes[path]
    if (entry === undefined) throw new Error(`unrouted fetch ${path}`)
    const list = Array.isArray(entry) ? entry : [entry]
    const n = counts.get(path) ?? 0
    counts.set(path, n + 1)
    const { status, payload } = list[Math.min(n, list.length - 1)]
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        payload === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(payload),
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const paths = (fn: ReturnType<typeof routeFetch>) =>
  fn.mock.calls.map((call) => String(call[0]).replace('/ovirt-engine/api', ''))

describe('list-grid column reads', () => {
  beforeEach(() => {
    setSessionToken('tok-123')
    resetFollowDenials()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('listVmsReportedDevices', () => {
    it('reads /vms?follow=reported_devices once and keys devices by VM', async () => {
      const fetchMock = routeFetch({
        '/vms?search=name%3Dweb*&follow=reported_devices': {
          status: 200,
          payload: {
            vm: [
              {
                id: 'vm-1',
                name: 'web-1',
                reported_devices: {
                  reported_device: [
                    { id: 'd-1', ips: { ip: [{ address: '10.0.0.5', version: 'v4' }] } },
                  ],
                },
              },
              // agent-less guest: the wrapper is present, its inner key omitted
              { id: 'vm-2', name: 'web-2', reported_devices: {} },
            ],
          },
        },
      })
      const byVm = await listVmsReportedDevices({ search: 'name=web*' })
      expect(paths(fetchMock)).toEqual(['/vms?search=name%3Dweb*&follow=reported_devices'])
      expect(byVm['vm-1']?.[0]?.ips?.ip?.[0]?.address).toBe('10.0.0.5')
      expect(byVm['vm-2']).toEqual([])
    })

    it('degrades to an empty map on a 5xx and skips the follow while denied', async () => {
      const fetchMock = routeFetch({
        '/vms?follow=reported_devices': { status: 500, payload: { fault: {} } },
      })
      await expect(listVmsReportedDevices()).resolves.toEqual({})
      await expect(listVmsReportedDevices()).resolves.toEqual({})
      // the second call is answered by the denial, not a second doomed read
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('listDiskOwnerNames', () => {
    it('joins one VM and one template read into disk id → owner names', async () => {
      const fetchMock = routeFetch({
        '/vms?follow=disk_attachments': {
          status: 200,
          payload: {
            vm: [
              {
                id: 'vm-1',
                name: 'web-1',
                disk_attachments: { disk_attachment: [{ disk: { id: 'd-root' } }] },
              },
              {
                id: 'vm-2',
                name: 'web-2',
                disk_attachments: {
                  disk_attachment: [{ disk: { id: 'd-shared' } }, { disk: { id: 'd-two' } }],
                },
              },
              // a disk-less VM: the engine omits the key
              { id: 'vm-3', name: 'empty' },
            ],
          },
        },
        '/templates?follow=disk_attachments': {
          status: 200,
          payload: {
            template: [
              {
                id: 'tpl-1',
                name: 'rhel9',
                disk_attachments: { disk_attachment: [{ disk: { id: 'd-shared' } }] },
              },
            ],
          },
        },
      })
      const owners = await listDiskOwnerNames()
      expect(paths(fetchMock).sort()).toEqual([
        '/templates?follow=disk_attachments',
        '/vms?follow=disk_attachments',
      ])
      expect(owners).toEqual({
        'd-root': ['web-1'],
        'd-shared': ['web-2', 'rhel9'],
        'd-two': ['web-2'],
      })
    })

    it('keeps the VM leg when the template follow is refused', async () => {
      routeFetch({
        '/vms?follow=disk_attachments': {
          status: 200,
          payload: {
            vm: [
              {
                id: 'vm-1',
                name: 'web-1',
                disk_attachments: { disk_attachment: [{ disk: { id: 'd-1' } }] },
              },
            ],
          },
        },
        '/templates?follow=disk_attachments': { status: 400, payload: { fault: {} } },
      })
      await expect(listDiskOwnerNames()).resolves.toEqual({ 'd-1': ['web-1'] })
    })

    it('propagates an auth failure instead of rendering "attached to nothing"', async () => {
      routeFetch({
        '/vms?follow=disk_attachments': { status: 401 },
        '/templates?follow=disk_attachments': { status: 200, payload: {} },
      })
      await expect(listDiskOwnerNames()).rejects.toMatchObject({ status: 401 })
    })
  })

  describe('listNetworkLabelTexts', () => {
    it('reads /networks?follow=network_labels once and keys label ids by network', async () => {
      const fetchMock = routeFetch({
        '/networks?follow=network_labels': {
          status: 200,
          payload: {
            network: [
              {
                id: 'net-1',
                name: 'ovirtmgmt',
                network_labels: { network_label: [{ id: 'mgmt' }, { id: 'lab' }] },
              },
              { id: 'net-2', name: 'vm-prod', network_labels: {} },
            ],
          },
        },
      })
      await expect(listNetworkLabelTexts()).resolves.toEqual({
        'net-1': ['mgmt', 'lab'],
        'net-2': [],
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('degrades to an empty map when the engine refuses the follow', async () => {
      routeFetch({ '/networks?follow=network_labels': { status: 500, payload: { fault: {} } } })
      await expect(listNetworkLabelTexts()).resolves.toEqual({})
    })
  })

  describe('listAllDataCenterQoss', () => {
    it('reads /qoss once per data center and flattens, tolerating a QoS-less 404', async () => {
      const fetchMock = routeFetch({
        '/datacenters': {
          status: 200,
          payload: {
            data_center: [
              { id: 'dc-1', name: 'Default' },
              { id: 'dc-2', name: 'Edge' },
            ],
          },
        },
        '/datacenters/dc-1/qoss': {
          status: 200,
          payload: { qos: [{ id: 'q-1', name: 'gold', type: 'network', inbound_average: '10' }] },
        },
        '/datacenters/dc-2/qoss': { status: 404, payload: { fault: {} } },
      })
      const qoss = await listAllDataCenterQoss()
      expect(paths(fetchMock).sort()).toEqual([
        '/datacenters',
        '/datacenters/dc-1/qoss',
        '/datacenters/dc-2/qoss',
      ])
      expect(qoss).toMatchObject([{ id: 'q-1', name: 'gold', inbound_average: 10 }])
    })

    it('propagates a per-DC 403', async () => {
      routeFetch({
        '/datacenters': { status: 200, payload: { data_center: [{ id: 'dc-1', name: 'D' }] } },
        '/datacenters/dc-1/qoss': { status: 403 },
      })
      await expect(listAllDataCenterQoss()).rejects.toMatchObject({ status: 403 })
    })
  })

  describe('listGlusterVolumes follow=statistics', () => {
    it('falls back to the bare per-cluster read when the follow 5xxs', async () => {
      const fetchMock = routeFetch({
        '/clusters': { status: 200, payload: { cluster: [{ id: 'c-1', name: 'gluster' }] } },
        '/clusters/c-1/glustervolumes?follow=statistics': { status: 500, payload: { fault: {} } },
        '/clusters/c-1/glustervolumes': {
          status: 200,
          payload: { gluster_volume: [{ id: 'gv-1', name: 'data' }] },
        },
      })
      const volumes = await listGlusterVolumes()
      expect(paths(fetchMock)).toEqual([
        '/clusters',
        '/clusters/c-1/glustervolumes?follow=statistics',
        '/clusters/c-1/glustervolumes',
      ])
      expect(volumes).toMatchObject([{ id: 'gv-1' }])
      expect(glusterVolumeCapacity(volumes[0])).toBeUndefined()
    })
  })
})

describe('glusterVolumeCapacity', () => {
  const volume = (statistic: unknown[]) =>
    GlusterVolumeListSchema.parse({
      gluster_volume: [{ id: 'gv', name: 'gv', statistics: { statistic } }],
    }).gluster_volume![0]

  it('reads the used/total byte gauges, coercing string datums', () => {
    const gauge = (name: string, datum: string) => ({
      id: name,
      name,
      values: { value: [{ datum }] },
    })
    expect(
      glusterVolumeCapacity(
        volume([gauge('memory.total.size', '1000'), gauge('memory.used.size', '250')]),
      ),
    ).toEqual({ used: 250, total: 1000 })
  })

  it('is undefined for an empty wrapper (no stored capacity yet) or a zero total', () => {
    expect(glusterVolumeCapacity(volume([]))).toBeUndefined()
    expect(
      glusterVolumeCapacity(
        volume([
          { id: 't', name: 'memory.total.size', values: { value: [{ datum: 0 }] } },
          { id: 'u', name: 'memory.used.size', values: { value: [{ datum: 0 }] } },
        ]),
      ),
    ).toBeUndefined()
  })
})

describe('runningVmCounts', () => {
  it("counts pool members the engine's view counts as running (not down / image_locked)", () => {
    const vms = VmListSchema.parse({
      vm: [
        { id: '1', name: 'a', status: 'up', vm_pool: { id: 'p-1' } },
        { id: '2', name: 'b', status: 'powering_up', vm_pool: { id: 'p-1' } },
        { id: '3', name: 'c', status: 'down', vm_pool: { id: 'p-1' } },
        { id: '4', name: 'd', status: 'image_locked', vm_pool: { id: 'p-2' } },
        { id: '5', name: 'e', status: 'suspended', vm_pool: { id: 'p-2' } },
        { id: '6', name: 'f', status: 'up' },
      ],
    }).vm!
    expect(runningVmCounts(vms)).toEqual(
      new Map([
        ['p-1', 2],
        ['p-2', 1],
      ]),
    )
  })
})

describe('mock engine: followed list reads', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockVms()
  })
  afterEach(() => vi.useRealTimers())

  async function call(path: string): Promise<unknown> {
    const promise = mockRequest(path, { method: 'GET' })
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('inlines reported devices on /vms?follow=reported_devices', async () => {
    const data = (await call('/vms?follow=reported_devices')) as {
      vm: { id: string; reported_devices?: { reported_device?: { ips?: unknown }[] } }[]
    }
    const web01 = data.vm.find((vm) => vm.id === 'vm-01')
    expect(web01?.reported_devices?.reported_device?.[0]?.ips).toBeDefined()
    // every VM carries the wrapper once followed
    expect(data.vm.every((vm) => vm.reported_devices !== undefined)).toBe(true)
    // and nothing is inlined without the follow term
    const bare = (await call('/vms')) as { vm: Record<string, unknown>[] }
    expect(bare.vm.some((vm) => 'reported_devices' in vm)).toBe(false)
  })

  it('serves live CPU / network gauges on the list rows', async () => {
    const data = VmListSchema.parse(await call('/vms?follow=tags,statistics'))
    const stats = data.vm?.find((vm) => vm.id === 'vm-01')?.statistics?.statistic ?? []
    expect(stats.find((stat) => stat.name === 'cpu.current.total')?.values?.value?.[0]?.datum).toBe(
      23.5,
    )
    expect(
      stats.find((stat) => stat.name === 'network.current.total')?.values?.value?.[0]?.datum,
    ).toBe(4.25)
  })

  it('inlines template disk attachments on /templates?follow=disk_attachments', async () => {
    const data = (await call('/templates?follow=disk_attachments')) as {
      template: {
        id: string
        disk_attachments?: { disk_attachment?: { disk?: { id?: string } }[] }
      }[]
    }
    const blank = data.template.find((template) => template.id === 'tpl-00')
    expect(blank?.disk_attachments?.disk_attachment?.[0]?.disk?.id).toBe('tpl-00-disk-1')
  })

  it('inlines labels on /networks?follow=network_labels, empty wrapper when none', async () => {
    const data = NetworkListSchema.parse(await call('/networks?follow=network_labels'))
    const byId = new Map(
      (data.network ?? []).map((network) => [
        network.id,
        (network as { network_labels?: { network_label?: { id: string }[] } }).network_labels,
      ]),
    )
    expect(byId.get('net-01')).toEqual({ network_label: [{ id: 'mgmt' }] })
    // net-02's bare subcollection 404s; the followed wrapper is still present
    expect(byId.get('net-02')).toEqual({})
  })

  it('inlines capacity gauges on glustervolumes?follow=statistics', async () => {
    const data = GlusterVolumeListSchema.parse(
      await call('/clusters/cluster-02/glustervolumes?follow=statistics'),
    )
    const byId = new Map((data.gluster_volume ?? []).map((volume) => [volume.id, volume]))
    expect(glusterVolumeCapacity(byId.get('gvol-01')!)).toEqual({
      used: 120 * 1024 ** 3,
      total: 300 * 1024 ** 3,
    })
    // no stored capacity → empty wrapper → em dash
    expect(glusterVolumeCapacity(byId.get('gvol-02')!)).toBeUndefined()
  })

  it('serves a flat-list disk with a quota link that resolves in its data center', async () => {
    const disks = (await call('/disks')) as { disk: { id: string; quota?: { id?: string } }[] }
    const quotaId = disks.disk.find((disk) => disk.quota !== undefined)?.quota?.id
    const quotas = (await call('/datacenters/dc-01/quotas')) as { quota: { id: string }[] }
    expect(quotas.quota.map((quota) => quota.id)).toContain(quotaId)
  })

  it("binds vnic profiles' and networks' QoS links to QoS entries the DC serves", async () => {
    const qoss = (await call('/datacenters/dc-01/qoss')) as { qos: { id: string }[] }
    const qosIds = qoss.qos.map((qos) => qos.id)
    const networks = NetworkListSchema.parse(await call('/networks'))
    const networkQos = (networks.network ?? []).flatMap((n) => (n.qos?.id ? [n.qos.id] : []))
    expect(networkQos.length).toBeGreaterThan(0)
    for (const id of networkQos) expect(qosIds).toContain(id)
    const profiles = (await call('/vnicprofiles')) as { vnic_profile: { qos?: { id?: string } }[] }
    const profileQos = profiles.vnic_profile.flatMap((p) => (p.qos?.id ? [p.qos.id] : []))
    expect(profileQos.length).toBeGreaterThan(0)
    for (const id of profileQos) expect(qosIds).toContain(id)
  })
})
