import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fenceHost, hostAction, reinstallHost } from './resources/hosts'
import { changeVmCd, getVmCdromFileId, runOnceVm, VM_CDROM_ID } from './resources/vms'
import { attachVmDisk, setVmDiskAttachmentActive } from './resources/disks'
import {
  attachNetworkToCluster,
  detachNetworkFromCluster,
  updateClusterNetwork,
} from './resources/networks'
import { clearSessionToken, setSessionToken } from './session'

// Stub the global fetch (NOT mock-engine-backed) so we assert the exact wire
// request the Phase-1 resource fns build. Mirrors disks-crud.test.ts.
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

const BASE = '/ovirt-engine/api'

describe('Phase 1 action request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  // --- host lifecycle --------------------------------------------------------

  it('hostAction POSTs /hosts/{id}/{action} with an empty body', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await hostAction('host-01', 'refresh')
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/hosts/host-01/refresh`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('fenceHost POSTs /hosts/{id}/fence with the fence_type', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await fenceHost('host-01', 'restart')
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/hosts/host-01/fence`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ fence_type: 'restart' })
  })

  it('reinstallHost sends password auth + ?activate=false when activate is off', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await reinstallHost('host-01', {
      authMethod: 'password',
      rootPassword: 'sekret',
      activateAfterInstall: false,
    })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/hosts/host-01/install?activate=false`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      root_password: 'sekret',
      ssh: { port: 22, authentication_method: 'password' },
    })
  })

  it('reinstallHost defaults to publickey auth, no activate query, and deploys hosted-engine', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await reinstallHost('host-01', { hostedEngine: 'deploy' })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/hosts/host-01/install`)
    expect(JSON.parse(init.body as string)).toEqual({
      ssh: { port: 22, authentication_method: 'publickey' },
      deploy_hosted_engine: true,
    })
  })

  // --- VM change CD ----------------------------------------------------------

  it('getVmCdromFileId returns the inserted file id and undefined for an empty tray', async () => {
    const withIso = mockFetch(200, { id: VM_CDROM_ID, file: { id: 'iso-9' } })
    expect(await getVmCdromFileId('vm-01')).toBe('iso-9')
    expect(lastRequest(withIso)[0]).toBe(`${BASE}/vms/vm-01/cdroms/${VM_CDROM_ID}`)

    vi.unstubAllGlobals()
    setSessionToken('tok-123')
    const empty = mockFetch(200, { id: VM_CDROM_ID })
    expect(await getVmCdromFileId('vm-01', { current: true })).toBeUndefined()
    expect(lastRequest(empty)[0]).toBe(`${BASE}/vms/vm-01/cdroms/${VM_CDROM_ID}?current=true`)
  })

  it('changeVmCd PUTs the file id and targets the running guest with current=true', async () => {
    const fetchMock = mockFetch(200, {})
    await changeVmCd('vm-01', 'iso-9', { current: true })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/vms/vm-01/cdroms/${VM_CDROM_ID}?current=true`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ file: { id: 'iso-9' } })
  })

  it('changeVmCd ejects with an empty file id', async () => {
    const fetchMock = mockFetch(200, {})
    await changeVmCd('vm-01', '')
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/vms/vm-01/cdroms/${VM_CDROM_ID}`)
    expect(JSON.parse(init.body as string)).toEqual({ file: { id: '' } })
  })

  // --- VM disk attach / activate ---------------------------------------------

  it('attachVmDisk POSTs a bare disk link with the webadmin default scalars', async () => {
    const fetchMock = mockFetch(202, { id: 'vm-01-da-9' })
    await attachVmDisk('vm-01', { diskId: 'disk-9' })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/vms/vm-01/diskattachments`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      active: true,
      bootable: false,
      interface: 'virtio_scsi',
      disk: { id: 'disk-9' },
    })
  })

  it('setVmDiskAttachmentActive PUTs just the active flag', async () => {
    const fetchMock = mockFetch(200, {})
    await setVmDiskAttachmentActive('vm-01', 'da-1', false)
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/vms/vm-01/diskattachments/da-1`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ active: false })
  })

  // --- VM run once -----------------------------------------------------------

  it('runOnceVm builds the full run-config vm body plus pause', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await runOnceVm('vm-01', {
      bootDevices: ['cdrom', 'hd'],
      cdIsoId: 'iso-9',
      hostId: 'host-01',
      stateless: true,
      startPaused: true,
    })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/vms/vm-01/start`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      vm: {
        os: { boot: { devices: { device: ['cdrom', 'hd'] } } },
        cdroms: { cdrom: [{ file: { id: 'iso-9' } }] },
        placement_policy: { hosts: { host: [{ id: 'host-01' }] } },
        stateless: true,
      },
      pause: true,
    })
  })

  it('runOnceVm with no overrides POSTs an empty vm body', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await runOnceVm('vm-01', {})
    const [, init] = lastRequest(fetchMock)
    expect(JSON.parse(init.body as string)).toEqual({ vm: {} })
  })

  // --- cluster networks ------------------------------------------------------

  it('attachNetworkToCluster POSTs the network id plus the required flag', async () => {
    const fetchMock = mockFetch(201, { id: 'net-1', name: 'ovirtmgmt' })
    await attachNetworkToCluster('cl-1', 'net-1', { required: true })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/clusters/cl-1/networks`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ id: 'net-1', required: true })
  })

  it('updateClusterNetwork PUTs the changed required flag', async () => {
    const fetchMock = mockFetch(200, { id: 'net-1', name: 'ovirtmgmt' })
    await updateClusterNetwork('cl-1', 'net-1', { required: false })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/clusters/cl-1/networks/net-1`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ required: false })
  })

  it('detachNetworkFromCluster DELETEs the per-cluster network', async () => {
    const fetchMock = mockFetch(204)
    await detachNetworkFromCluster('cl-1', 'net-1')
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe(`${BASE}/clusters/cl-1/networks/net-1`)
    expect(init.method).toBe('DELETE')
  })
})
