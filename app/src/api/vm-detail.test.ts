import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getVm,
  listVmAffinityGroups,
  listVmAffinityLabels,
  listVmApplications,
  listVmErrata,
  listVmHostDevices,
  listVmPermissions,
  listVmReportedDevices,
} from './resources/vms'
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

describe('getVm', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vms/{id} with follow=cluster,template,host and coerces extended scalars', async () => {
    const fetchMock = mockFetch(200, {
      id: 'vm-01',
      name: 'testrhel9',
      status: 'up',
      memory: '4294967296',
      cluster: { id: 'cluster-01', name: 'Default' },
      template: { id: 'tpl-00', name: 'Blank' },
      host: { id: 'host-01', name: 'kvmnode' },
      creation_time: '1744625700000',
      start_time: '1751356800000',
      stateless: 'false',
      memory_policy: { guaranteed: '4294967296', max: 8589934592 },
      cpu: { architecture: 'x86_64', topology: { sockets: '2', cores: 1, threads: '1' } },
      bios: { type: 'q35_ovmf', boot_menu: { enabled: 'true' } },
      display: { type: 'vnc', monitors: '1', copy_paste_enabled: 'true' },
      usb: { enabled: 'false' },
      high_availability: { enabled: 'true', priority: '50' },
      guest_operating_system: {
        distribution: 'Red Hat Enterprise Linux',
        version: { full_version: '9.4' },
      },
    })

    const vm = await getVm('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/vms/vm-01?follow=cluster,template,host,statistics',
    )
    expect(vm.memory).toBe(4294967296)
    expect(vm.cluster?.name).toBe('Default')
    expect(vm.template?.name).toBe('Blank')
    expect(vm.host?.name).toBe('kvmnode')
    expect(vm.creation_time).toBe(1744625700000)
    expect(vm.stateless).toBe(false)
    expect(vm.memory_policy?.guaranteed).toBe(4294967296)
    expect(vm.memory_policy?.max).toBe(8589934592)
    expect(vm.cpu?.topology?.sockets).toBe(2)
    expect(vm.cpu?.topology?.cores).toBe(1)
    expect(vm.cpu?.topology?.threads).toBe(1)
    expect(vm.bios?.type).toBe('q35_ovmf')
    expect(vm.bios?.boot_menu?.enabled).toBe(true)
    expect(vm.display?.monitors).toBe(1)
    expect(vm.display?.copy_paste_enabled).toBe(true)
    expect(vm.usb?.enabled).toBe(false)
    expect(vm.high_availability?.enabled).toBe(true)
    expect(vm.high_availability?.priority).toBe(50)
    expect(vm.guest_operating_system?.version?.full_version).toBe('9.4')
  })

  it('encodes the vm id in the path', async () => {
    const fetchMock = mockFetch(200, { id: 'a/b', name: 'weird' })
    await getVm('a/b')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/vms/a%2Fb?follow=cluster,template,host,statistics',
    )
  })
})

describe('vm subcollections', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listVmApplications parses the application list', async () => {
    const fetchMock = mockFetch(200, {
      application: [{ id: 'app-1', name: 'nginx-1.24.0-1.el9.x86_64' }],
    })
    const apps = await listVmApplications('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/applications')
    expect(apps[0].name).toBe('nginx-1.24.0-1.el9.x86_64')
  })

  it('listVmApplications handles the empty-list quirk (missing "application" key)', async () => {
    mockFetch(200, {})
    await expect(listVmApplications('vm-01')).resolves.toEqual([])
  })

  it('listVmReportedDevices parses nested ips', async () => {
    const fetchMock = mockFetch(200, {
      reported_device: [
        {
          id: 'rdev-1',
          name: 'eth0',
          mac: { address: '56:6f:1a:2b:01:01' },
          ips: { ip: [{ address: '10.0.0.51', version: 'v4' }] },
        },
      ],
    })
    const devices = await listVmReportedDevices('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/reporteddevices')
    expect(devices[0].ips?.ip?.[0].address).toBe('10.0.0.51')
    expect(devices[0].mac?.address).toBe('56:6f:1a:2b:01:01')
  })

  it('listVmHostDevices parses mixed vendor/product shapes', async () => {
    const fetchMock = mockFetch(200, {
      host_device: [{ id: 'dev-1', name: 'pci_0000_00_00_0', vendor: { name: 'Intel' } }],
    })
    const devices = await listVmHostDevices('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/hostdevices')
    expect(devices[0].vendor).toEqual({ name: 'Intel' })
  })

  it('listVmPermissions parses role name and coerces string administrative', async () => {
    const fetchMock = mockFetch(200, {
      permission: [{ id: 'p-1', role: { name: 'SuperUser', administrative: 'true' } }],
    })
    const permissions = await listVmPermissions('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/permissions?follow=role')
    expect(permissions[0].role?.name).toBe('SuperUser')
    expect(permissions[0].role?.administrative).toBe(true)
  })

  it('listVmAffinityGroups follows vms and filters to the given vm id', async () => {
    const fetchMock = mockFetch(200, {
      affinity_group: [
        { id: 'ag-1', name: 'keep-apart', vms: { vm: [{ id: 'vm-01' }, { id: 'vm-99' }] } },
        { id: 'ag-2', name: 'unrelated', vms: { vm: [{ id: 'vm-42' }] } },
      ],
    })
    const groups = await listVmAffinityGroups('cluster-01', 'vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/clusters/cluster-01/affinitygroups?follow=vms',
    )
    expect(groups.map((g) => g.id)).toEqual(['ag-1'])
  })
})

describe('vm optional subcollections (404-tolerant)', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listVmAffinityLabels resolves empty on a 404 subcollection', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listVmAffinityLabels('vm-01')).resolves.toEqual([])
  })

  it('listVmErrata resolves empty on a 404 (no Satellite integration)', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listVmErrata('vm-01')).resolves.toEqual([])
  })

  it('listVmErrata rethrows non-404 errors', async () => {
    mockFetch(503, { fault: { reason: 'Service Unavailable' } })
    await expect(listVmErrata('vm-01')).rejects.toMatchObject({ status: 503 })
  })

  it('listVmAffinityGroups resolves empty on a 404 cluster', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listVmAffinityGroups('nope', 'vm-01')).resolves.toEqual([])
  })
})

describe('mock vm detail (through the mock engine)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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
  async function call<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('getVm parses vm-01 with all the enriched fields', async () => {
    const vm = await call(getVm('vm-01'))
    expect(vm.name).toBe('web-01')
    expect(vm.cluster?.name).toBe('Default')
    expect(vm.template?.name).toBe('Blank')
    expect(vm.host?.name).toBe('node-01')
    expect(vm.bios?.type).toBe('q35_sea_bios')
    expect(vm.display?.type).toBe('vnc')
    expect(vm.display?.monitors).toBe(1)
    expect(vm.memory_policy?.guaranteed).toBe(4 * 1024 ** 3)
    expect(vm.cpu?.topology?.sockets).toBe(2)
    expect(vm.cpu?.topology?.cores).toBe(1)
    expect(vm.high_availability?.enabled).toBe(true)
    expect(vm.high_availability?.priority).toBe(50)
    expect(vm.guest_operating_system?.distribution).toBe('Red Hat Enterprise Linux')
    expect(vm.guest_operating_system?.version?.full_version).toBe('9.4')
    expect(vm.creation_time).toBe(Date.UTC(2026, 3, 14, 10, 15))
    expect(vm.stateless).toBe(false)
  })

  it('serves installed applications on vm-01', async () => {
    const apps = await call(listVmApplications('vm-01'))
    expect(apps.length).toBeGreaterThanOrEqual(1)
    expect(apps.some((a) => a.name?.startsWith('nginx'))).toBe(true)
  })

  it('serves empty applications for a VM with no guest agent', async () => {
    await expect(call(listVmApplications('vm-08'))).resolves.toEqual([])
  })

  it('serves a reported device with an IPv4 on vm-01', async () => {
    const devices = await call(listVmReportedDevices('vm-01'))
    expect(devices).toHaveLength(1)
    expect(devices[0].ips?.ip?.some((ip) => ip.address === '10.0.0.51')).toBe(true)
  })

  it('serves empty host devices for vm-01', async () => {
    await expect(call(listVmHostDevices('vm-01'))).resolves.toEqual([])
  })

  it('serves the SuperUser admin grant plus a removable UserRole grant', async () => {
    const permissions = await call(listVmPermissions('vm-01'))
    expect(permissions).toHaveLength(2)
    expect(permissions[0].role?.name).toBe('SuperUser')
    expect(permissions[0].role?.administrative).toBe(true)
    expect(permissions[1].role?.name).toBe('UserRole')
    expect(permissions[1].role?.administrative).toBe(false)
  })

  it('serves empty affinity labels, errata, and affinity groups', async () => {
    await expect(call(listVmAffinityLabels('vm-01'))).resolves.toEqual([])
    await expect(call(listVmErrata('vm-01'))).resolves.toEqual([])
    await expect(call(listVmAffinityGroups('cluster-01', 'vm-01'))).resolves.toEqual([])
  })

  it('404s affinity groups for an unknown cluster', async () => {
    const promise = mockRequest('/clusters/nope/affinitygroups', { method: 'GET' })
    const rejection = expect(promise).rejects.toMatchObject({ status: 404 })
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })

  it('404s subcollections for an unknown vm id', async () => {
    const promise = mockRequest('/vms/nope/applications', { method: 'GET' })
    const rejection = expect(promise).rejects.toMatchObject({ status: 404 })
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })
})
