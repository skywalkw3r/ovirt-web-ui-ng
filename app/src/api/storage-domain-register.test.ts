import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listUnregisteredStorageDomainTemplates,
  listUnregisteredStorageDomainVms,
  registerStorageDomainTemplate,
  registerStorageDomainVm,
} from './resources/storageDomains'
import { clearSessionToken, setSessionToken } from './session'

// Resource-level unit tests: stub global fetch and assert the wire request
// (URL, method, query flag, body) plus response parsing — mirror
// api/storage-domain-lifecycle.test.ts. Not mock-engine backed; the mock owner
// exercises the "register removes it from the unregistered set / 409 guards"
// dispatch separately in handlers.test.ts.
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

describe('storage-domain register resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  // ── list unregistered VMs ─────────────────────────────────────────────────

  it('listUnregisteredStorageDomainVms GETs /vms with the unregistered flag and returns the vm array', async () => {
    const fetchMock = mockFetch(200, {
      vm: [
        // fixtures deliberately mix scalar string/number forms so the schema
        // coercion runs: string memory here, number memory below
        { id: 'uvm-1', name: 'unreg-web', os: { type: 'rhel_9' }, memory: '4294967296' },
        { id: 'uvm-2', name: 'unreg-db', os: { type: 'sles_15' }, memory: 8589934592 },
      ],
    })

    const vms = await listUnregisteredStorageDomainVms('sd-01')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-01/vms?unregistered=true')
    expect(init.method ?? 'GET').toBe('GET')
    expect(vms).toHaveLength(2)
    expect(vms[0]).toMatchObject({ id: 'uvm-1', name: 'unreg-web' })
    // coerced through VmSchema — string memory becomes a number
    expect(vms[0].memory).toBe(4294967296)
    expect(vms[1].memory).toBe(8589934592)
  })

  it('listUnregisteredStorageDomainVms returns [] when the vm key is omitted (empty OVF store)', async () => {
    mockFetch(200, {})
    await expect(listUnregisteredStorageDomainVms('sd-01')).resolves.toEqual([])
  })

  it('listUnregisteredStorageDomainVms tolerates a 404 (non-data / unattached domain) as []', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no such collection' } })
    await expect(listUnregisteredStorageDomainVms('sd-03')).resolves.toEqual([])
  })

  it('listUnregisteredStorageDomainVms propagates a non-404 fault as an ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Internal', detail: 'boom' } })
    await expect(listUnregisteredStorageDomainVms('sd-01')).rejects.toMatchObject({
      status: 500,
      detail: 'boom',
    })
  })

  // ── list unregistered templates ───────────────────────────────────────────

  it('listUnregisteredStorageDomainTemplates GETs /templates with the unregistered flag and returns the template array', async () => {
    const fetchMock = mockFetch(200, {
      template: [{ id: 'utpl-1', name: 'unreg-base', os: { type: 'other' }, memory: '2147483648' }],
    })

    const templates = await listUnregisteredStorageDomainTemplates('sd-01')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-01/templates?unregistered=true')
    expect(templates).toHaveLength(1)
    expect(templates[0]).toMatchObject({ id: 'utpl-1', name: 'unreg-base' })
    expect(templates[0].memory).toBe(2147483648)
  })

  it('listUnregisteredStorageDomainTemplates returns [] when the template key is omitted', async () => {
    mockFetch(200, {})
    await expect(listUnregisteredStorageDomainTemplates('sd-01')).resolves.toEqual([])
  })

  it('listUnregisteredStorageDomainTemplates tolerates a 404 as []', async () => {
    mockFetch(404)
    await expect(listUnregisteredStorageDomainTemplates('sd-03')).resolves.toEqual([])
  })

  // ── register VM ───────────────────────────────────────────────────────────

  it('registerStorageDomainVm POSTs cluster.id to the vm register action and settles', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(
      registerStorageDomainVm('sd-01', 'uvm-1', { clusterId: 'cl-01' }),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-01/vms/uvm-1/register')
    expect(init.method).toBe('POST')
    // cluster is required in v1; allow_partial_import omitted when not supplied
    expect(JSON.parse(init.body as string)).toEqual({ cluster: { id: 'cl-01' } })
  })

  it('registerStorageDomainVm rides allow_partial_import in the body when set true', async () => {
    const fetchMock = mockFetch(200, {})
    await registerStorageDomainVm('sd-01', 'uvm-1', {
      clusterId: 'cl-01',
      allowPartialImport: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      cluster: { id: 'cl-01' },
      allow_partial_import: true,
    })
  })

  it('registerStorageDomainVm sends allow_partial_import=false explicitly when set false', async () => {
    const fetchMock = mockFetch(200, {})
    await registerStorageDomainVm('sd-01', 'uvm-1', {
      clusterId: 'cl-01',
      allowPartialImport: false,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // false is a meaningful value the caller chose — sent, not omitted
    expect(JSON.parse(init.body as string)).toEqual({
      cluster: { id: 'cl-01' },
      allow_partial_import: false,
    })
  })

  it('registerStorageDomainVm URL-encodes the domain and vm ids', async () => {
    const fetchMock = mockFetch(200, {})
    await registerStorageDomainVm('sd 01', 'uvm/1', { clusterId: 'cl-01' })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd%2001/vms/uvm%2F1/register')
  })

  it('registerStorageDomainVm surfaces a 409 (SD not active / missing cluster) as an ApiError', async () => {
    // the mock owner enforces the same guard: registering against an inactive
    // domain or with a target cluster the engine can't resolve fails
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Storage Domain is not active' },
    })
    await expect(
      registerStorageDomainVm('sd-01', 'uvm-1', { clusterId: 'missing' }),
    ).rejects.toMatchObject({ status: 409, detail: 'Storage Domain is not active' })
  })

  // ── register template ─────────────────────────────────────────────────────

  it('registerStorageDomainTemplate POSTs cluster.id to the template register action and settles', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(
      registerStorageDomainTemplate('sd-01', 'utpl-1', { clusterId: 'cl-01' }),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-01/templates/utpl-1/register')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ cluster: { id: 'cl-01' } })
  })

  it('registerStorageDomainTemplate rides allow_partial_import when set', async () => {
    const fetchMock = mockFetch(200, {})
    await registerStorageDomainTemplate('sd-01', 'utpl-1', {
      clusterId: 'cl-01',
      allowPartialImport: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      cluster: { id: 'cl-01' },
      allow_partial_import: true,
    })
  })

  it('registerStorageDomainTemplate surfaces a 409 as an ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'cluster is required' } })
    await expect(
      registerStorageDomainTemplate('sd-01', 'utpl-1', { clusterId: '' }),
    ).rejects.toMatchObject({ status: 409, detail: 'cluster is required' })
  })
})
