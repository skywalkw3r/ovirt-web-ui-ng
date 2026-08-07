import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createImageDisk,
  deleteDisk,
  listStorageDomainDiskProfiles,
  updateDisk,
} from './resources/disks'
import { ApiError } from './transport'
import { clearSessionToken, setSessionToken } from './session'

const GiB = 1024 ** 3

// Stub the global fetch (NOT mock-engine-backed) so we assert the exact wire
// request the resource fns build and how they surface an engine fault. Mirrors
// the mockFetch/lastRequest helpers in disk-features.test.ts.
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

describe('disk CRUD request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  // --- createImageDisk -------------------------------------------------------

  it('createImageDisk POSTs /disks with disk fields at the top level and applies the off-by-default booleans', async () => {
    const fetchMock = mockFetch(202, { id: 'disk-new', status: 'locked' })
    await createImageDisk({
      alias: 'web-data',
      provisionedSize: 10 * GiB,
      storageDomainId: 'sd-01',
      format: 'cow',
      sparse: true,
    })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks')
    expect(init.method).toBe('POST')
    // No { disk: {...} } envelope; bootable/shareable/wipe default false and
    // content_type defaults 'data'; description and disk_profile are omitted.
    expect(JSON.parse(init.body as string)).toEqual({
      alias: 'web-data',
      provisioned_size: 10 * GiB,
      format: 'cow',
      sparse: true,
      bootable: false,
      shareable: false,
      wipe_after_delete: false,
      content_type: 'data',
      storage_domains: { storage_domain: [{ id: 'sd-01' }] },
    })
  })

  it('createImageDisk carries every field when a preallocated raw disk is created with all options set', async () => {
    const fetchMock = mockFetch(202, { id: 'disk-new', status: 'locked' })
    await createImageDisk({
      alias: 'db-vol',
      description: 'database volume',
      provisionedSize: 50 * GiB,
      storageDomainId: 'sd-block',
      format: 'raw',
      sparse: false,
      bootable: true,
      shareable: true,
      wipeAfterDelete: true,
      diskProfileId: 'dp-02',
      contentType: 'data',
    })

    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({
      alias: 'db-vol',
      description: 'database volume',
      provisioned_size: 50 * GiB,
      format: 'raw',
      sparse: false,
      bootable: true,
      shareable: true,
      wipe_after_delete: true,
      content_type: 'data',
      storage_domains: { storage_domain: [{ id: 'sd-block' }] },
      disk_profile: { id: 'dp-02' },
    })
  })

  it('createImageDisk parses the created disk through the schema (booleanish + string size coerce)', async () => {
    // The live engine serializes scalars as JSON strings — the returned entity
    // must coerce through DiskSchema.
    mockFetch(202, {
      id: 'disk-new',
      alias: 'web-data',
      status: 'locked',
      provisioned_size: '10737418240',
      sparse: 'true',
      shareable: 'false',
    })
    const disk = await createImageDisk({
      alias: 'web-data',
      provisionedSize: 10 * GiB,
      storageDomainId: 'sd-01',
      format: 'cow',
      sparse: true,
    })
    expect(disk.id).toBe('disk-new')
    expect(disk.provisioned_size).toBe(10 * GiB)
    expect(disk.sparse).toBe(true)
    expect(disk.shareable).toBe(false)
  })

  // --- updateDisk ------------------------------------------------------------

  it('updateDisk PUTs /disks/{id} with only the changed fields at the top level', async () => {
    const fetchMock = mockFetch(200, { id: 'disk-1' })
    await updateDisk('disk-1', {
      alias: 'renamed',
      description: 'now documented',
      provisionedSize: 20 * GiB,
      shareable: true,
      wipeAfterDelete: true,
      diskProfileId: 'dp-02',
    })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks/disk-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      alias: 'renamed',
      description: 'now documented',
      provisioned_size: 20 * GiB,
      shareable: true,
      wipe_after_delete: true,
      disk_profile: { id: 'dp-02' },
    })
  })

  it('updateDisk omits every field left undefined so unchanged attributes are untouched', async () => {
    const fetchMock = mockFetch(200, { id: 'disk-1' })
    // A rename-only edit: nothing else on the wire (no provisioned_size, so the
    // grow-only path is never triggered).
    await updateDisk('disk-1', { alias: 'just-a-rename' })

    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({ alias: 'just-a-rename' })
  })

  it('updateDisk sends an empty body when the spec has no changes', async () => {
    const fetchMock = mockFetch(200, { id: 'disk-1' })
    await updateDisk('disk-1', {})
    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({})
  })

  it('updateDisk keeps a false shareable/wipe on the wire (distinct from omitted)', async () => {
    // false must not be dropped as falsy — turning a flag OFF is a real edit.
    const fetchMock = mockFetch(200, { id: 'disk-1' })
    await updateDisk('disk-1', { shareable: false, wipeAfterDelete: false })
    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({
      shareable: false,
      wipe_after_delete: false,
    })
  })

  it('updateDisk sends the requested provisioned_size and surfaces the engine grow-only 409 as an ApiError', async () => {
    // The resource layer has no current size to compare against — the grow-only
    // guard is engine/mock-side. A shrink request still goes on the wire; the
    // engine answers 409 and updateDisk must reject with ApiError(409) carrying
    // the fault detail (not swallow it).
    mockFetch(409, {
      fault: {
        reason: 'Operation Failed',
        detail: 'New disk size must be larger than the current one',
      },
    })

    const error = await updateDisk('disk-1', { provisionedSize: 1 * GiB }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
  })

  it('updateDisk propagates the grow-only fault detail as the error message', async () => {
    mockFetch(409, {
      fault: {
        reason: 'Operation Failed',
        detail: 'New disk size must be larger than the current one',
      },
    })
    await expect(updateDisk('disk-1', { provisionedSize: 1 * GiB })).rejects.toThrow(
      'New disk size must be larger than the current one',
    )
  })

  // --- deleteDisk ------------------------------------------------------------

  it('deleteDisk DELETEs /disks/{id} with no body', async () => {
    const fetchMock = mockFetch(200, {})
    await deleteDisk('disk-1')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks/disk-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('deleteDisk surfaces a 404 on an unknown id as an ApiError', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'Entity not found' } })
    const error = await deleteDisk('no-such-disk').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })

  // --- listStorageDomainDiskProfiles -----------------------------------------

  it('listStorageDomainDiskProfiles GETs the SD-scoped subcollection and unwraps disk_profile', async () => {
    const fetchMock = mockFetch(200, {
      disk_profile: [
        { id: 'dp-01', name: 'default' },
        { id: 'dp-02', name: 'gold' },
      ],
    })
    const profiles = await listStorageDomainDiskProfiles('sd-01')

    expect(lastRequest(fetchMock)[0]).toBe('/ovirt-engine/api/storagedomains/sd-01/diskprofiles')
    expect(profiles.map((p) => p.id)).toEqual(['dp-01', 'dp-02'])
  })

  it('listStorageDomainDiskProfiles tolerates a 404 subcollection as an empty list', async () => {
    // An SD with no profiles (or a mock without the route) answers 404 — the
    // picker degrades to the domain default rather than erroring.
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no profiles' } })
    await expect(listStorageDomainDiskProfiles('sd-empty')).resolves.toEqual([])
  })

  it('listStorageDomainDiskProfiles does NOT swallow a non-404 failure', async () => {
    mockFetch(500, { fault: { reason: 'Server Error', detail: 'boom' } })
    const error = await listStorageDomainDiskProfiles('sd-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(500)
  })
})
