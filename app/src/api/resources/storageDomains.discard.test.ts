import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildLocalStorageDomainBody,
  buildManagedBlockStorageDomainBody,
  createBlockStorageDomain,
  createLocalStorageDomain,
  createManagedBlockStorageDomain,
  updateStorageDomain,
} from './storageDomains'
import { listHostLuns } from './hostStorage'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (same as storageDomains.test.ts): the exact
// path/verb/body each resource fn puts on the wire.
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

function sentBody(fetchMock: ReturnType<typeof mockFetch>, call = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[call] as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('Discard After Delete on the wire', () => {
  it('rides on the block create body only when set', async () => {
    const fetchMock = mockFetch(201, { id: 'sd-9', name: 'blk' })
    await createBlockStorageDomain({
      name: 'blk',
      type: 'data',
      hostName: 'node-01',
      storageType: 'iscsi',
      lunIds: ['lun-1'],
      discard_after_delete: true,
    })
    expect(sentBody(fetchMock)).toMatchObject({ discard_after_delete: true })

    const plain = mockFetch(201, { id: 'sd-9', name: 'blk' })
    await createBlockStorageDomain({
      name: 'blk',
      type: 'data',
      hostName: 'node-01',
      storageType: 'fcp',
      lunIds: ['lun-1'],
    })
    expect(sentBody(plain)).not.toHaveProperty('discard_after_delete')
  })

  it('PUTs discard_after_delete on edit and parses supports_discard back', async () => {
    const fetchMock = mockFetch(200, {
      id: 'sd-5',
      name: 'blk',
      discard_after_delete: 'true',
      supports_discard: 'true',
    })
    const updated = await updateStorageDomain('sd-5', { discard_after_delete: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-5')
    expect(init.method).toBe('PUT')
    expect(sentBody(fetchMock)).toEqual({ discard_after_delete: true })
    // string booleans coerce through the schema
    expect(updated).toMatchObject({ discard_after_delete: true, supports_discard: true })
  })
})

describe('Managed Block Storage create', () => {
  it('builds storage.driver_options / driver_sensitive_options with the domain function', () => {
    const body = buildManagedBlockStorageDomainBody({
      name: 'ceph-mbs',
      hostName: 'node-01',
      driverOptions: [
        { name: ' volume_driver ', value: 'cinder.volume.drivers.rbd.RBDDriver' },
        { name: '', value: '' },
      ],
      driverSensitiveOptions: [{ name: 'rbd_secret', value: ' s3cr et ' }],
      description: 'Ceph RBD',
    })
    expect(body).toEqual({
      name: 'ceph-mbs',
      type: 'managed_block_storage',
      host: { name: 'node-01' },
      description: 'Ceph RBD',
      storage: {
        type: 'managed_block_storage',
        // names trimmed, blank rows dropped
        driver_options: {
          property: [{ name: 'volume_driver', value: 'cinder.volume.drivers.rbd.RBDDriver' }],
        },
        // secret values ride verbatim
        driver_sensitive_options: { property: [{ name: 'rbd_secret', value: ' s3cr et ' }] },
      },
    })
    // the engine forces these off for MBS, so they never ride
    expect(body).not.toHaveProperty('wipe_after_delete')
    expect(body).not.toHaveProperty('backup')
    expect(body).not.toHaveProperty('discard_after_delete')
  })

  it('omits driver_sensitive_options when there are none', () => {
    const body = buildManagedBlockStorageDomainBody({
      name: 'mbs',
      hostName: 'node-01',
      driverOptions: [{ name: 'volume_driver', value: 'x' }],
      driverSensitiveOptions: [{ name: '', value: '' }],
    })
    expect(body.storage).not.toHaveProperty('driver_sensitive_options')
  })

  it('POSTs the body to /storagedomains', async () => {
    const fetchMock = mockFetch(201, { id: 'sd-mbs', name: 'mbs' })
    const created = await createManagedBlockStorageDomain({
      name: 'mbs',
      hostName: 'node-01',
      driverOptions: [{ name: 'volume_driver', value: 'x' }],
    })
    expect(created.id).toBe('sd-mbs')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains')
    expect(init.method).toBe('POST')
    expect(sentBody(fetchMock)).toMatchObject({
      type: 'managed_block_storage',
      storage: { type: 'managed_block_storage' },
    })
  })
})

describe('Local on Host (localfs) create', () => {
  it('takes the host by id or by name and sends a data-domain localfs body', () => {
    expect(
      buildLocalStorageDomainBody({ name: 'local', host: { id: 'host-03' }, path: '/data' }),
    ).toEqual({
      name: 'local',
      type: 'data',
      host: { id: 'host-03' },
      storage: { type: 'localfs', path: '/data' },
    })
    expect(
      buildLocalStorageDomainBody({
        name: 'local',
        host: { name: 'node-03' },
        path: '/data',
        wipe_after_delete: true,
        warning_low_space_indicator: 20,
      }),
    ).toMatchObject({
      host: { name: 'node-03' },
      wipe_after_delete: true,
      warning_low_space_indicator: 20,
    })
  })

  it('is a single POST: the engine attaches the domain itself, so no attach call follows', async () => {
    const fetchMock = mockFetch(201, { id: 'sd-local', name: 'local', status: 'active' })
    await createLocalStorageDomain({ name: 'local', host: { id: 'host-03' }, path: '/data' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains')
  })
})

describe('listHostLuns', () => {
  it('keeps discard_max_size (coerced) and filters to the requested fabric', async () => {
    const fetchMock = mockFetch(200, {
      host_storage: [
        {
          type: 'iscsi',
          logical_units: {
            logical_unit: [
              { id: 'lun-a', discard_max_size: '4194304', size: '1073741824' },
              { id: 'lun-b', discard_max_size: 0 },
            ],
          },
        },
        { type: 'fcp', logical_units: { logical_unit: [{ id: 'lun-fc' }] } },
      ],
    })
    const luns = await listHostLuns('host-01', 'iscsi')
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    // bare read, never ?follow=
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/storage')
    expect(luns.map((lun) => [lun.id, lun.discardMaxSize])).toEqual([
      ['lun-a', 4194304],
      ['lun-b', 0],
    ])
    expect(luns[0].size).toBe(1073741824)
  })
})
