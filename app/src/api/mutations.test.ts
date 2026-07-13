import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVmDisk, detachVmDisk, resizeVmDisk } from './resources/disks'
import { addHost, hostAction } from './resources/hosts'
import { addVmNic, removeVmNic, updateVmNic } from './resources/nics'
import { fetchVmStatistics, migrateVm } from './resources/vms'
import { mockRequest, resetMockVms } from './mock/handlers'
import { ApiError, type RequestOptions } from './transport'
import { clearSessionToken, setSessionToken } from './session'

const GiB = 1024 ** 3

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

function lastRequest(fetchMock: ReturnType<typeof mockFetch>): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit]
}

describe('mutation request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('createVmDisk POSTs the nested disk with size and storage domain', async () => {
    const fetchMock = mockFetch(202, {})
    await createVmDisk('vm-01', {
      name: 'data',
      sizeBytes: 10 * GiB,
      storageDomainId: 'sd-01',
      bootable: true,
    })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/diskattachments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      active: true,
      bootable: true,
      interface: 'virtio_scsi',
      disk: {
        alias: 'data',
        format: 'cow',
        sparse: true,
        provisioned_size: 10 * GiB,
        storage_domains: { storage_domain: [{ id: 'sd-01' }] },
      },
    })
  })

  it('resizeVmDisk PUTs only the new provisioned_size to the attachment', async () => {
    const fetchMock = mockFetch(200, {})
    await resizeVmDisk('vm-01', 'vm-01-da-1', 60 * GiB)

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/diskattachments/vm-01-da-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ disk: { provisioned_size: 60 * GiB } })
  })

  it('detachVmDisk DELETEs the attachment with no body', async () => {
    const fetchMock = mockFetch(200, {})
    await detachVmDisk('vm-01', 'vm-01-da-1')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/diskattachments/vm-01-da-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('addVmNic POSTs a plugged+linked virtio NIC with the profile reference', async () => {
    const fetchMock = mockFetch(201, {})
    await addVmNic('vm-01', { name: 'nic2', vnicProfileId: 'vnic-02' })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/nics')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'nic2',
      interface: 'virtio',
      plugged: true,
      linked: true,
      vnic_profile: { id: 'vnic-02' },
    })
  })

  it('addVmNic omits vnic_profile entirely when no profile is chosen', async () => {
    const fetchMock = mockFetch(201, {})
    await addVmNic('vm-01', { name: 'nic2' })

    const [, init] = lastRequest(fetchMock)
    expect(JSON.parse(init.body as string)).not.toHaveProperty('vnic_profile')
  })

  it('updateVmNic PUTs only the patched fields', async () => {
    const fetchMock = mockFetch(200, {})
    await updateVmNic('vm-01', 'vm-01-nic-1', { plugged: false })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/nics/vm-01-nic-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ plugged: false })
  })

  it('removeVmNic DELETEs the NIC with no body', async () => {
    const fetchMock = mockFetch(200, {})
    await removeVmNic('vm-01', 'vm-01-nic-1')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/nics/vm-01-nic-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('migrateVm POSTs an empty body so the engine picks the host', async () => {
    const fetchMock = mockFetch(200, {})
    await migrateVm('vm-01')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/migrate')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
  })

  it('migrateVm pins the destination with a host reference when given', async () => {
    const fetchMock = mockFetch(200, {})
    await migrateVm('vm-01', { hostId: 'host-02' })

    const [, init] = lastRequest(fetchMock)
    expect(JSON.parse(init.body as string)).toEqual({ host: { id: 'host-02' } })
  })

  it('hostAction POSTs an empty action body to the lifecycle endpoint', async () => {
    const fetchMock = mockFetch(200, {})
    await hostAction('host-01', 'deactivate')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/deactivate')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
  })

  it('hostAction targets the activate endpoint when activating', async () => {
    const fetchMock = mockFetch(200, {})
    await hostAction('host-03', 'activate')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/hosts/host-03/activate')
    expect(init.method).toBe('POST')
  })

  it('addHost POSTs the install body with password auth and no query when defaults hold', async () => {
    const fetchMock = mockFetch(201, { id: 'host-new-3', name: 'node-04', status: 'installing' })
    await addHost({
      name: 'node-04',
      address: 'node-04.lab.local',
      clusterId: 'cluster-01',
      rootPassword: 'fixture-password',
      powerManagement: { enabled: false, kdumpDetection: true, automaticPm: true },
      spmPriority: 5,
    })

    const [url, init] = lastRequest(fetchMock)
    // activate/reboot default to true engine-side, so no query params ride
    expect(url).toBe('/ovirt-engine/api/hosts')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'node-04',
      address: 'node-04.lab.local',
      cluster: { id: 'cluster-01' },
      ssh: { port: 22, authentication_method: 'password' },
      root_password: 'fixture-password',
      power_management: { enabled: false, kdump_detection: true, automatic_pm_enabled: true },
      spm: { priority: 5 },
    })
  })

  it('addHost appends activate/reboot=false and sends no secret for publickey auth', async () => {
    const fetchMock = mockFetch(201, { id: 'host-new-3', name: 'node-04', status: 'installing' })
    await addHost({
      name: 'node-04',
      address: 'node-04.lab.local',
      clusterId: 'cluster-01',
      sshPort: 2222,
      authMethod: 'publickey',
      activateAfterInstall: false,
      rebootAfterInstall: false,
    })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/hosts?activate=false&reboot=false')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'node-04',
      address: 'node-04.lab.local',
      cluster: { id: 'cluster-01' },
      ssh: { port: 2222, authentication_method: 'publickey' },
    })
  })

  it('addHost maps console address, kernel cmdline and the hosted-engine deploy knob', async () => {
    const fetchMock = mockFetch(201, { id: 'host-new-3', name: 'node-04', status: 'installing' })
    await addHost({
      name: 'node-04',
      address: 'node-04.lab.local',
      clusterId: 'cluster-01',
      rootPassword: 'fixture-password',
      consoleAddress: 'console.lab.local',
      kernelCmdline: 'intel_iommu=on',
      deployHostedEngine: true,
    })

    const [url, init] = lastRequest(fetchMock)
    // deploy_hosted_engine rides as a query param (like activate/reboot),
    // while the console/kernel values are body fields HostMapper honors
    expect(url).toBe('/ovirt-engine/api/hosts?deploy_hosted_engine=true')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.display).toEqual({ address: 'console.lab.local' })
    expect(body.os).toEqual({ custom_kernel_cmdline: 'intel_iommu=on' })
  })
})

describe('fetchVmStatistics', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('coerces string datum samples into numbers', async () => {
    const fetchMock = mockFetch(200, {
      statistic: [
        {
          id: 's1',
          name: 'cpu.current.guest',
          kind: 'gauge',
          unit: 'percent',
          // the live engine serializes numeric scalars as JSON strings
          values: { value: [{ datum: '42.5' }] },
        },
      ],
    })

    const stats = await fetchVmStatistics('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/statistics')
    expect(stats[0]?.name).toBe('cpu.current.guest')
    expect(stats[0]?.values?.value?.[0]?.datum).toBe(42.5)
  })
})

describe('mock mutation handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockVms()
  })
  afterEach(() => vi.useRealTimers())

  // Every mock response sits behind a short latency timer; settle it without
  // reaching any of the longer transition timers.
  async function call(path: string, opts: RequestOptions = {}): Promise<unknown> {
    const promise = mockRequest(path, opts).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function listAttachments(vmId: string): Promise<{ id: string; disk?: { id?: string } }[]> {
    const data = (await call(`/vms/${vmId}/diskattachments`)) as {
      disk_attachment: { id: string; disk?: { id?: string } }[]
    }
    return data.disk_attachment
  }

  it('created disks appear locked and settle to ok after the settle delay', async () => {
    const created = (await call('/vms/vm-01/diskattachments', {
      method: 'POST',
      body: {
        bootable: false,
        interface: 'virtio_scsi',
        disk: {
          alias: 'scratch',
          provisioned_size: 10 * GiB,
          storage_domains: { storage_domain: [{ id: 'sd-01' }] },
        },
      },
    })) as { id: string; disk: { status: string } }
    expect(created.disk.status).toBe('locked')

    await vi.advanceTimersByTimeAsync(3_000)
    const attachments = await listAttachments('vm-01')
    expect(attachments).toHaveLength(2)
    expect(attachments.find((a) => a.id === created.id)).toMatchObject({
      disk: { name: 'scratch', status: 'ok' },
    })
  })

  it('resize grows provisioned_size but rejects a shrink with 409', async () => {
    // fixture disk vm-01-da-1 is provisioned at 50 GiB
    await call('/vms/vm-01/diskattachments/vm-01-da-1', {
      method: 'PUT',
      body: { disk: { provisioned_size: 60 * GiB } },
    })
    expect(await listAttachments('vm-01')).toMatchObject([{ disk: { provisioned_size: 60 * GiB } }])

    const error = await call('/vms/vm-01/diskattachments/vm-01-da-1', {
      method: 'PUT',
      body: { disk: { provisioned_size: 20 * GiB } },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect(await listAttachments('vm-01')).toMatchObject([{ disk: { provisioned_size: 60 * GiB } }])
  })

  it('detach removes the attachment but the disk survives in /disks', async () => {
    await call('/vms/vm-01/diskattachments/vm-01-da-1', { method: 'DELETE' })

    expect(await listAttachments('vm-01')).toHaveLength(0)
    const { disk: flat } = (await call('/disks')) as { disk: { id: string }[] }
    expect(flat.some((d) => d.id === 'vm-01-disk-1')).toBe(true)
  })

  it('NIC add, edit and remove mutate the collection immediately', async () => {
    const created = (await call('/vms/vm-01/nics', {
      method: 'POST',
      body: { name: 'nic2', plugged: true, linked: true, vnic_profile: { id: 'vnic-02' } },
    })) as { id: string }

    await call(`/vms/vm-01/nics/${created.id}`, { method: 'PUT', body: { plugged: false } })
    const { nic } = (await call('/vms/vm-01/nics')) as {
      nic: { id: string; plugged?: boolean }[]
    }
    expect(nic).toHaveLength(2)
    expect(nic.find((n) => n.id === created.id)).toMatchObject({ name: 'nic2', plugged: false })

    await call(`/vms/vm-01/nics/${created.id}`, { method: 'DELETE' })
    expect(((await call('/vms/vm-01/nics')) as { nic: unknown[] }).nic).toHaveLength(1)
  })

  it('migrate only works on an up VM and reassigns the host after ~5s', async () => {
    // vm-08 is down — migration must be refused
    const error = await call('/vms/vm-08/migrate', { method: 'POST', body: {} })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)

    // vm-01 is up on host-01
    await call('/vms/vm-01/migrate', { method: 'POST', body: {} })
    expect(await call('/vms/vm-01')).toMatchObject({ status: 'migrating' })

    await vi.advanceTimersByTimeAsync(5_000)
    const vm = (await call('/vms/vm-01')) as { status: string; host: { id: string } }
    expect(vm.status).toBe('up')
    expect(vm.host.id).not.toBe('host-01')
  })

  it('statistics serve wandering utilization gauges shaped like a 4.5 engine', async () => {
    // Deterministic drift: Math.random() = 1 nudges every sample upward.
    const random = vi.spyOn(Math, 'random').mockReturnValue(1)
    try {
      const first = (await call('/vms/vm-01/statistics')) as {
        statistic: {
          name: string
          values: { value: [{ datum?: number | string; detail?: string }] }
        }[]
      }
      const byName = new Map(first.statistic.map((s) => [s.name, s]))
      // 4.5 gauge set: NO memory.usage; network.current.total present; disks.usage
      // carried as a string on `.detail`.
      for (const name of [
        'cpu.current.guest',
        'cpu.current.total',
        'memory.installed',
        'memory.used',
        'memory.usage.history',
        'network.current.total',
        'disks.usage',
      ]) {
        expect(byName.has(name)).toBe(true)
      }
      expect(byName.has('memory.usage')).toBe(false)

      // Percent gauges stay within 0–100 (the byte gauges deliberately do not).
      for (const name of [
        'cpu.current.guest',
        'cpu.current.total',
        'memory.usage.history',
        'network.current.total',
      ]) {
        const datum = Number(byName.get(name)?.values.value[0].datum)
        expect(datum).toBeGreaterThanOrEqual(0)
        expect(datum).toBeLessThanOrEqual(100)
      }

      // disks.usage is a JSON string on `.detail`, not a numeric datum.
      const detail = byName.get('disks.usage')?.values.value[0].detail
      expect(typeof detail).toBe('string')
      const parsed = JSON.parse(detail as string) as { total: string; used: string }[]
      expect(parsed.length).toBeGreaterThan(0)
      expect(Number(parsed[0].total)).toBeGreaterThan(0)

      const second = (await call('/vms/vm-01/statistics')) as typeof first
      const cpuTotal = (poll: typeof first) =>
        Number(poll.statistic.find((s) => s.name === 'cpu.current.total')?.values.value[0].datum)
      expect(cpuTotal(second)).toBeGreaterThan(cpuTotal(first))
    } finally {
      random.mockRestore()
    }
  })

  async function hostStatus(id: string): Promise<string | undefined> {
    const { host } = (await call('/hosts')) as { host: { id: string; status?: string }[] }
    return host.find((h) => h.id === id)?.status
  }

  it('deactivate walks a host through preparing_for_maintenance to maintenance', async () => {
    // host-01 is up
    await call('/hosts/host-01/deactivate', { method: 'POST', body: {} })
    expect(await hostStatus('host-01')).toBe('preparing_for_maintenance')

    await vi.advanceTimersByTimeAsync(4_000)
    expect(await hostStatus('host-01')).toBe('maintenance')
  })

  it('activate flips a maintenance host straight to up', async () => {
    // host-03 is the maintenance fixture
    await call('/hosts/host-03/activate', { method: 'POST', body: {} })
    expect(await hostStatus('host-03')).toBe('up')
  })

  it('rejects activating an up host and deactivating a maintenance host with 409', async () => {
    const activated = await call('/hosts/host-01/activate', { method: 'POST', body: {} })
    expect(activated).toBeInstanceOf(ApiError)
    expect((activated as ApiError).status).toBe(409)

    const deactivated = await call('/hosts/host-03/deactivate', { method: 'POST', body: {} })
    expect(deactivated).toBeInstanceOf(ApiError)
    expect((deactivated as ApiError).status).toBe(409)
    // guard rejections must leave the fixtures untouched
    expect(await hostStatus('host-01')).toBe('up')
    expect(await hostStatus('host-03')).toBe('maintenance')
  })

  it('created hosts install, initialize, then come up — without echoing the password', async () => {
    const created = (await call('/hosts', {
      method: 'POST',
      body: {
        name: 'node-04',
        address: 'node-04.lab.local',
        cluster: { id: 'cluster-01' },
        ssh: { port: 22, authentication_method: 'password' },
        root_password: 'fixture-password',
      },
    })) as { id: string; status: string; cluster?: { name?: string } }
    expect(created.status).toBe('installing')
    expect(created.cluster?.name).toBe('Default')
    // SECURITY: the password must never leave the in-flight request body
    expect(JSON.stringify(created)).not.toContain('fixture-password')

    // default reboot=true holds 'installing' across the extra reboot window
    await vi.advanceTimersByTimeAsync(4_000)
    expect(await hostStatus(created.id)).toBe('installing')
    await vi.advanceTimersByTimeAsync(4_000)
    expect(await hostStatus(created.id)).toBe('initializing')
    await vi.advanceTimersByTimeAsync(4_000)
    expect(await hostStatus(created.id)).toBe('up')

    // the stored fixture never carries the password either
    const detail = await call(`/hosts/${created.id}`)
    expect(JSON.stringify(detail)).not.toContain('fixture-password')
  })

  it('activate=false and reboot=false park the new host in maintenance after one hop', async () => {
    const created = (await call('/hosts?activate=false&reboot=false', {
      method: 'POST',
      body: {
        name: 'node-05',
        address: 'node-05.lab.local',
        cluster: { id: 'cluster-01' },
        ssh: { port: 22, authentication_method: 'publickey' },
      },
    })) as { id: string; status: string }
    expect(created.status).toBe('installing')

    await vi.advanceTimersByTimeAsync(4_000)
    expect(await hostStatus(created.id)).toBe('maintenance')
  })

  it('stores console and kernel overrides on the created host without echoing secrets', async () => {
    const created = (await call('/hosts?deploy_hosted_engine=true', {
      method: 'POST',
      body: {
        name: 'node-07',
        address: 'node-07.lab.local',
        cluster: { id: 'cluster-01' },
        ssh: { port: 22, authentication_method: 'password' },
        root_password: 'fixture-password',
        display: { address: 'console.lab.local' },
        os: { custom_kernel_cmdline: 'intel_iommu=on' },
      },
    })) as { id: string; display?: { address?: string }; os?: { custom_kernel_cmdline?: string } }
    // built field-by-field, so the create-time values round-trip…
    expect(created.display).toEqual({ address: 'console.lab.local' })
    expect(created.os).toEqual({ custom_kernel_cmdline: 'intel_iommu=on' })
    // …but the password never does
    expect(JSON.stringify(created)).not.toContain('fixture-password')

    const detail = await call(`/hosts/${created.id}`)
    expect(detail).toMatchObject({
      display: { address: 'console.lab.local' },
      os: { custom_kernel_cmdline: 'intel_iommu=on' },
    })
    expect(JSON.stringify(detail)).not.toContain('fixture-password')
  })

  it('rejects an incomplete or duplicate host add without touching the fixtures', async () => {
    const noAddress = await call('/hosts', {
      method: 'POST',
      body: { name: 'node-06', cluster: { id: 'cluster-01' } },
    })
    expect(noAddress).toBeInstanceOf(ApiError)
    expect((noAddress as ApiError).status).toBe(400)

    const noCluster = await call('/hosts', {
      method: 'POST',
      body: { name: 'node-06', address: 'node-06.lab.local' },
    })
    expect(noCluster).toBeInstanceOf(ApiError)
    expect((noCluster as ApiError).status).toBe(400)

    const duplicate = await call('/hosts', {
      method: 'POST',
      body: { name: 'node-01', address: 'dupe.lab.local', cluster: { id: 'cluster-01' } },
    })
    expect(duplicate).toBeInstanceOf(ApiError)
    expect((duplicate as ApiError).status).toBe(409)

    const { host } = (await call('/hosts')) as { host: unknown[] }
    // 3 virt hosts + 3 gluster brick nodes — the rejects above added none
    expect(host).toHaveLength(6)
  })

  it('serves graphics consoles and a virt-viewer INI file per console', async () => {
    // ?current=true mirrors the runtime-console semantics buildVvFile relies
    // on (the mock strips the query before matching)
    const { graphics_console: consoles } = (await call(
      '/vms/vm-01/graphicsconsoles?current=true',
    )) as {
      graphics_console: { id: string; protocol: string }[]
    }
    expect(consoles.map((c) => c.protocol)).toEqual(['vnc', 'spice'])

    // the .vv rides the remoteviewerconnectionfile ACTION (POST), matching
    // the api-model — the old Accept: x-virt-viewer GET is gone
    const { remote_viewer_connection_file: vv } = (await call(
      `/vms/vm-01/graphicsconsoles/${consoles[0]?.id}/remoteviewerconnectionfile`,
      { method: 'POST', body: {} },
    )) as { remote_viewer_connection_file: string }
    expect(vv.startsWith('[virt-viewer]')).toBe(true)
    expect(vv).toContain('type=vnc')
    expect(vv).toContain('title=web-01:%d')
  })
})
