import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExternalVmImport } from './resources/externalVmImports'
import { importVmFromExportDomain, listStorageDomainVms } from './resources/storageDomains'
import { clearSessionToken, setSessionToken } from './session'

// Resource-level unit tests for the VM import feature: stub global fetch and
// assert the wire request (URL, method, body shape) plus response parsing —
// mirror api/storage-domain-register.test.ts. The mock-engine dispatch
// (guards, echo) is exercised separately in mock/handlers.test.ts.
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

describe('vm import resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  // ── export-domain VM listing (the wizard's checkbox source) ───────────────

  it('listStorageDomainVms serves an export domain: GET /vms and coerce the rows', async () => {
    const fetchMock = mockFetch(200, {
      vm: [
        // string memory exercises z.coerce.number(); exported VMs are down
        { id: 'export-vm-01', name: 'exported-web', status: 'down', memory: '2147483648' },
        { id: 'export-vm-02', name: 'exported-db', status: 'down', memory: 8589934592 },
      ],
    })

    const vms = await listStorageDomainVms('sd-export')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-export/vms')
    expect(init.method ?? 'GET').toBe('GET')
    expect(vms).toHaveLength(2)
    expect(vms[0].memory).toBe(2147483648)
    expect(vms[1].memory).toBe(8589934592)
  })

  // ── export-domain import action ────────────────────────────────────────────

  it('importVmFromExportDomain POSTs cluster + storage_domain + async and settles', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(
      importVmFromExportDomain('sd-export', 'export-vm-01', {
        clusterId: 'cl-01',
        storageDomainId: 'sd-01',
      }),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-export/vms/export-vm-01/import')
    expect(init.method).toBe('POST')
    // clone/collapse_snapshots omitted when unset — false is the engine default
    expect(JSON.parse(init.body as string)).toEqual({
      cluster: { id: 'cl-01' },
      storage_domain: { id: 'sd-01' },
      async: true,
    })
  })

  it('importVmFromExportDomain rides clone and collapse_snapshots when true', async () => {
    const fetchMock = mockFetch(200, {})
    await importVmFromExportDomain('sd-export', 'export-vm-01', {
      clusterId: 'cl-01',
      storageDomainId: 'sd-01',
      clone: true,
      collapseSnapshots: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      cluster: { id: 'cl-01' },
      storage_domain: { id: 'sd-01' },
      async: true,
      clone: true,
      collapse_snapshots: true,
    })
  })

  it('importVmFromExportDomain omits clone/collapse when explicitly false', async () => {
    const fetchMock = mockFetch(200, {})
    await importVmFromExportDomain('sd-export', 'export-vm-01', {
      clusterId: 'cl-01',
      storageDomainId: 'sd-01',
      clone: false,
      collapseSnapshots: false,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // false IS the engine default — unlike register's allow_partial_import
    // (an explicit user choice), these ride only when true
    expect(JSON.parse(init.body as string)).toEqual({
      cluster: { id: 'cl-01' },
      storage_domain: { id: 'sd-01' },
      async: true,
    })
  })

  it('importVmFromExportDomain URL-encodes the domain and vm ids', async () => {
    const fetchMock = mockFetch(200, {})
    await importVmFromExportDomain('sd 04', 'vm/1', {
      clusterId: 'cl-01',
      storageDomainId: 'sd-01',
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd%2004/vms/vm%2F1/import')
  })

  it('importVmFromExportDomain surfaces an engine fault as an ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Storage Domain is not an export domain' },
    })
    await expect(
      importVmFromExportDomain('sd-01', 'vm-01', { clusterId: 'cl-01', storageDomainId: 'sd-02' }),
    ).rejects.toMatchObject({ status: 409, detail: 'Storage Domain is not an export domain' })
  })

  // ── external (virt-v2v) import ─────────────────────────────────────────────

  it('createExternalVmImport POSTs the full VMware payload shape', async () => {
    const fetchMock = mockFetch(201, {})
    await expect(
      createExternalVmImport({
        provider: 'vmware',
        url: 'vpx://vmware_user@vcenter.lab/DC1/Cluster1/esxi-01.lab?no_verify=1',
        name: 'legacy-web',
        targetName: 'imported-legacy-web',
        clusterId: 'cl-01',
        storageDomainId: 'sd-01',
        sparse: true,
        username: 'vmware_user',
        password: 's3cret',
        hostId: 'host-01',
      }),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/externalvmimports')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      provider: 'vmware',
      url: 'vpx://vmware_user@vcenter.lab/DC1/Cluster1/esxi-01.lab?no_verify=1',
      name: 'legacy-web',
      vm: { name: 'imported-legacy-web' },
      cluster: { id: 'cl-01' },
      storage_domain: { id: 'sd-01' },
      sparse: true,
      username: 'vmware_user',
      password: 's3cret',
      host: { id: 'host-01' },
    })
  })

  it('createExternalVmImport omits credentials and host when not provided (KVM ssh URI)', async () => {
    const fetchMock = mockFetch(201, {})
    await createExternalVmImport({
      provider: 'kvm',
      url: 'qemu+ssh://root@kvm-host/system',
      name: 'kvm-guest',
      targetName: 'kvm-guest',
      clusterId: 'cl-01',
      storageDomainId: 'sd-01',
      sparse: false,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      provider: 'kvm',
      url: 'qemu+ssh://root@kvm-host/system',
      name: 'kvm-guest',
      vm: { name: 'kvm-guest' },
      cluster: { id: 'cl-01' },
      storage_domain: { id: 'sd-01' },
      sparse: false,
    })
    expect(body).not.toHaveProperty('username')
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('host')
  })

  it('createExternalVmImport sends the xen provider verbatim', async () => {
    const fetchMock = mockFetch(201, {})
    await createExternalVmImport({
      provider: 'xen',
      url: 'xen+ssh://root@xen-host',
      name: 'xen-guest',
      targetName: 'xen-guest-imported',
      clusterId: 'cl-01',
      storageDomainId: 'sd-01',
      sparse: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({
      provider: 'xen',
      url: 'xen+ssh://root@xen-host',
      vm: { name: 'xen-guest-imported' },
    })
  })

  it('createExternalVmImport surfaces an engine fault as an ApiError', async () => {
    mockFetch(400, {
      fault: { reason: 'Incomplete parameters', detail: 'ExternalVmImport [url] required for add' },
    })
    await expect(
      createExternalVmImport({
        provider: 'vmware',
        url: '',
        name: 'x',
        targetName: 'x',
        clusterId: 'cl-01',
        storageDomainId: 'sd-01',
        sparse: true,
      }),
    ).rejects.toMatchObject({ status: 400, detail: 'ExternalVmImport [url] required for add' })
  })
})
