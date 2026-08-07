import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listStorageDomainDiskSnapshots } from './diskSnapshots'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — same posture as api/resources/users.test.ts:
// resources are unit-tested against a stubbed global fetch so they never touch
// the mock engine (owned elsewhere). Assert the URL emitted and the parsed
// result.
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

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('listStorageDomainDiskSnapshots', () => {
  it('GETs the disksnapshots subcollection and coerces string scalars', async () => {
    const fetchMock = mockFetch(200, {
      disk_snapshot: [
        {
          id: 'snap-01',
          alias: 'web-01_Disk1',
          description: 'nightly backup point',
          status: 'ok',
          // live-engine string numerics exercise the schema's coercion
          provisioned_size: '10737418240',
          actual_size: 4294967296,
          disk: { id: 'disk-01' },
        },
        {
          id: 'snap-02',
          alias: 'db-01_Disk1',
          status: 'illegal',
          provisioned_size: 21474836480,
          actual_size: '1073741824',
          disk: { id: 'disk-02' },
          parent: { id: 'snap-01' },
        },
      ],
    })

    const snapshots = await listStorageDomainDiskSnapshots('sd-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/storagedomains/sd-01/disksnapshots',
    )
    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]?.provisioned_size).toBe(10737418240)
    expect(snapshots[1]?.actual_size).toBe(1073741824)
    expect(snapshots[1]?.disk?.id).toBe('disk-02')
  })

  it('tolerates the empty-list key-omission quirk', async () => {
    mockFetch(200, {})
    await expect(listStorageDomainDiskSnapshots('sd-01')).resolves.toEqual([])
  })

  it('maps a 404 on the optional subcollection to an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listStorageDomainDiskSnapshots('sd-iso')).resolves.toEqual([])
  })

  it('surfaces a non-404 engine fault verbatim as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'Internal error' } })
    const error = await listStorageDomainDiskSnapshots('sd-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500, message: 'Internal error' })
  })
})
