import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { iscsiDiscover, iscsiLogin, listHostStorage } from './resources/hosts'
import { createBlockStorageDomain } from './resources/storageDomains'
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

function lastRequest(fetchMock: ReturnType<typeof mockFetch>): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit]
}

// ─── Request-shape assertions (fetch stubbed) ────────────────────────────────
// Assert the exact wire the resource fns build — the fields BackendHostResource
// validates (iscsi.address for discover; iscsi.address+target for login) and
// the create body's storage block.
describe('SAN storage request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('iscsiDiscover POSTs { iscsi: { address } } and omits absent optionals', async () => {
    const fetchMock = mockFetch(200, {
      discovered_targets: { iscsi_details: [{ address: '10.35.1.10', target: 'iqn.x:t0' }] },
    })
    const targets = await iscsiDiscover('host-01', { address: '10.35.1.10' })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/iscsidiscover')
    expect(init.method).toBe('POST')
    // address only — port/username/password ride only when set
    expect(JSON.parse(init.body as string)).toEqual({ iscsi: { address: '10.35.1.10' } })
    expect(targets).toEqual([{ address: '10.35.1.10', target: 'iqn.x:t0' }])
  })

  it('iscsiDiscover carries port and CHAP creds in the request body when set', async () => {
    const fetchMock = mockFetch(200, { discovered_targets: { iscsi_details: [] } })
    await iscsiDiscover('host-01', {
      address: '10.35.1.10',
      port: 3261,
      username: 'chapuser',
      password: 's3cret',
    })
    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({
      iscsi: { address: '10.35.1.10', port: 3261, username: 'chapuser', password: 's3cret' },
    })
  })

  it('iscsiDiscover falls back to the deprecated iscsi_targets string list', async () => {
    mockFetch(200, { iscsi_targets: { iscsi_target: ['iqn.x:t0', 'iqn.x:t1'] } })
    const targets = await iscsiDiscover('host-01', { address: '10.35.1.10' })
    expect(targets).toEqual([{ target: 'iqn.x:t0' }, { target: 'iqn.x:t1' }])
  })

  it('iscsiLogin POSTs { iscsi: { address, target } } — both required fields', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(
      iscsiLogin('host-01', { address: '10.35.1.10', target: 'iqn.x:t0' }),
    ).resolves.toBeUndefined()

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/iscsilogin')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      iscsi: { address: '10.35.1.10', target: 'iqn.x:t0' },
    })
  })

  it('iscsiLogin carries CHAP creds in the request body when set', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await iscsiLogin('host-01', {
      address: '10.35.1.10',
      target: 'iqn.x:t0',
      port: 3260,
      portal: '10.35.1.10:3260,1',
      username: 'chapuser',
      password: 's3cret',
    })
    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({
      iscsi: {
        address: '10.35.1.10',
        target: 'iqn.x:t0',
        port: 3260,
        portal: '10.35.1.10:3260,1',
        username: 'chapuser',
        password: 's3cret',
      },
    })
  })

  it('listHostStorage GETs /hosts/{id}/storage with NO ?follow= (live 500 guard)', async () => {
    const fetchMock = mockFetch(200, {
      host_storage: [
        { type: 'iscsi', logical_units: { logical_unit: [{ id: 'lun-1', size: '100' }] } },
      ],
    })
    const luns = await listHostStorage('host-01', 'iscsi')

    const [url] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/storage')
    expect(url).not.toContain('follow')
    expect(luns).toEqual([{ id: 'lun-1', size: 100 }])
  })

  it('listHostStorage filters to the requested block type and maps camelCase', async () => {
    mockFetch(200, {
      host_storage: [
        {
          type: 'iscsi',
          logical_units: {
            logical_unit: [
              { id: 'lun-i', vendor_id: 'LIO', product_id: 'blk', storage_domain_id: 'sd-x' },
            ],
          },
        },
        { type: 'fcp', logical_units: { logical_unit: [{ id: 'lun-f', serial: 'S1' }] } },
      ],
    })
    const iscsi = await listHostStorage('host-01', 'iscsi')
    expect(iscsi).toEqual([
      { id: 'lun-i', vendorId: 'LIO', productId: 'blk', storageDomainId: 'sd-x' },
    ])
    // the FC entry is filtered out of the iSCSI read
    expect(iscsi.some((l) => l.id === 'lun-f')).toBe(false)
  })

  it('createBlockStorageDomain builds the iSCSI storage block from LUN ids', async () => {
    const fetchMock = mockFetch(200, { id: 'sd-new-9', name: 'iscsi-data' })
    await createBlockStorageDomain({
      name: 'iscsi-data',
      type: 'data',
      hostName: 'node-01',
      storageType: 'iscsi',
      lunIds: ['lun-1', 'lun-2'],
    })
    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/storagedomains')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'iscsi-data',
      type: 'data',
      host: { name: 'node-01' },
      storage: {
        type: 'iscsi',
        logical_units: { logical_unit: [{ id: 'lun-1' }, { id: 'lun-2' }] },
      },
    })
  })

  it('createBlockStorageDomain carries FCP type and advanced options when set', async () => {
    const fetchMock = mockFetch(200, { id: 'sd-new-9', name: 'fc-data' })
    await createBlockStorageDomain({
      name: 'fc-data',
      type: 'data',
      hostName: 'node-01',
      storageType: 'fcp',
      lunIds: ['lun-f'],
      wipe_after_delete: true,
      warning_low_space_indicator: 10,
    })
    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({
      name: 'fc-data',
      type: 'data',
      host: { name: 'node-01' },
      storage: { type: 'fcp', logical_units: { logical_unit: [{ id: 'lun-f' }] } },
      wipe_after_delete: true,
      warning_low_space_indicator: 10,
    })
  })

  it('createBlockStorageDomain never puts a CHAP password in the create body', async () => {
    const fetchMock = mockFetch(200, { id: 'sd-new-9', name: 'iscsi-data' })
    await createBlockStorageDomain({
      name: 'iscsi-data',
      type: 'data',
      hostName: 'node-01',
      storageType: 'iscsi',
      lunIds: ['lun-1'],
    })
    // the login session carries the auth — the spec has no password field at all
    expect(lastRequest(fetchMock)[1].body as string).not.toContain('password')
  })
})

// ─── Mock-backed end to end ──────────────────────────────────────────────────
// The resource fns land in mockRequest (VITE_MOCK stubbed), zod parsing and the
// modeled engine guards included — the exact dev:mock path.
describe('SAN storage data layer (mock)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setSessionToken('tok-123')
    vi.stubEnv('VITE_MOCK', '1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetMockVms()
    clearSessionToken()
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('discovers iSCSI targets for a given address', async () => {
    const targets = await settle(iscsiDiscover('host-01', { address: '10.35.1.10', port: 3260 }))
    expect(targets.length).toBeGreaterThanOrEqual(1)
    expect(targets[0]).toMatchObject({
      address: '10.35.1.10',
      port: 3260,
      target: expect.stringContaining('iqn.'),
    })
    // the portal reflects the requested address:port
    expect(targets[0].portal).toContain('10.35.1.10:3260')
  })

  it('rejects an iSCSI discover missing the address (validateParameters)', async () => {
    await settleRejection(
      mockRequest('/hosts/host-01/iscsidiscover', { method: 'POST', body: { iscsi: {} } }),
      { status: 400, message: expect.stringContaining('iscsi.address') },
    )
  })

  it('logs into a target (empty envelope) and rejects a missing target', async () => {
    await expect(
      settle(iscsiLogin('host-01', { address: '10.35.1.10', target: 'iqn.x:t0' })),
    ).resolves.toBeUndefined()
    await settleRejection(
      mockRequest('/hosts/host-01/iscsilogin', {
        method: 'POST',
        body: { iscsi: { address: '10.35.1.10' } },
      }),
      { status: 400, message: expect.stringContaining('iscsi.target') },
    )
  })

  it('lists iSCSI LUNs with one already-in-a-domain (grey) row', async () => {
    const luns = await settle(listHostStorage('host-01', 'iscsi'))
    expect(luns).toHaveLength(2)
    const free = luns.find((l) => l.storageDomainId === undefined)
    const used = luns.find((l) => l.storageDomainId !== undefined)
    expect(free).toBeDefined()
    expect(free?.size).toBe(107374182400)
    // the used LUN carries the guard fields the picker greys on
    expect(used?.storageDomainId).toBe('sd-02')
    expect(used?.volumeGroupId).toBe('vg-abc-002')
    // string port coerced to number
    expect(used?.port).toBe(3260)
  })

  it('lists FC LUNs immediately (no discover/login) filtered from iSCSI', async () => {
    const fc = await settle(listHostStorage('host-01', 'fcp'))
    expect(fc).toHaveLength(1)
    expect(fc[0]).toMatchObject({ id: '3600a098038303053422b4b6a59684441', vendorId: 'NETAPP' })
    // the iSCSI LUNs are not in the FC read
    expect(fc.some((l) => l.target?.includes('iqn.'))).toBe(false)
  })

  it('serves the empty-list quirk for a host with no LUNs', async () => {
    // host-02 has no hostStorage fixture → { } (omitted key) → []
    expect(await settle(listHostStorage('host-02', 'iscsi'))).toEqual([])
  })

  it('creates and attaches a block storage domain end to end', async () => {
    const created = await settle(
      createBlockStorageDomain({
        name: 'iscsi-data-1',
        type: 'data',
        hostName: 'node-01',
        storageType: 'iscsi',
        lunIds: ['36001405abcdef0000000000000000001'],
      }),
    )
    expect(created.id).toMatch(/^sd-new-/)
    expect(created.name).toBe('iscsi-data-1')
    // the create round-trips the block storage block back through the schema
    expect(created.storage?.type).toBe('iscsi')
    expect(created.storage?.logical_units?.logical_unit).toEqual([
      { id: '36001405abcdef0000000000000000001' },
    ])
    // and attach flips it active
    await settle(
      mockRequest('/datacenters/dc-01/storagedomains', {
        method: 'POST',
        body: { id: created.id },
      }),
    )
  })

  it('rejects creating a domain on a LUN already part of another domain', async () => {
    await settleRejection(
      createBlockStorageDomain({
        name: 'iscsi-dup',
        type: 'data',
        hostName: 'node-01',
        storageType: 'iscsi',
        // this LUN's fixture has storage_domain_id: 'sd-02'
        lunIds: ['36001405abcdef0000000000000000002'],
      }),
      { status: 409, message: expect.stringContaining('already part of a storage domain') },
    )
  })

  it('never echoes the CHAP password back in the discover response', async () => {
    const raw = (await settle(
      mockRequest('/hosts/host-01/iscsidiscover', {
        method: 'POST',
        body: { iscsi: { address: '10.35.1.10', username: 'chapuser', password: 's3cret' } },
      }),
    )) as unknown
    expect(JSON.stringify(raw)).not.toContain('s3cret')
    expect(JSON.stringify(raw)).not.toContain('password')
  })

  it('never echoes the CHAP password back in the login response', async () => {
    const raw = (await settle(
      mockRequest('/hosts/host-01/iscsilogin', {
        method: 'POST',
        body: { iscsi: { address: '10.35.1.10', target: 'iqn.x:t0', password: 's3cret' } },
      }),
    )) as unknown
    expect(JSON.stringify(raw)).not.toContain('s3cret')
    expect(JSON.stringify(raw)).not.toContain('password')
  })
})
