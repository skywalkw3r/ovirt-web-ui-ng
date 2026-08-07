import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cloneVmFromSnapshot,
  commitSnapshot,
  listSnapshots,
  previewSnapshot,
  undoSnapshot,
} from './snapshots'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/users.test.ts so these cover the
// wire shape without reaching the mock engine.
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

describe('listSnapshots', () => {
  it('GETs /vms/{id}/snapshots and tolerates the empty-collection quirk', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(listSnapshots('vm-01')).resolves.toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/snapshots')
  })
})

describe('cloneVmFromSnapshot', () => {
  it('POSTs /vms with name + snapshots.snapshot[{id}] + cluster and parses the created VM', async () => {
    const fetchMock = mockFetch(200, {
      id: 'vm-clone-1',
      name: 'restored-vm',
      status: 'image_locked',
    })

    const vm = await cloneVmFromSnapshot({
      name: 'restored-vm',
      snapshotId: 'snap-42',
      clusterId: 'cluster-01',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'restored-vm',
      snapshots: { snapshot: [{ id: 'snap-42' }] },
      cluster: { id: 'cluster-01' },
    })
    expect(vm.id).toBe('vm-clone-1')
    expect(vm.status).toBe('image_locked')
  })

  it('surfaces a duplicate-name fault verbatim as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'VM name restored-vm is already in use' },
    })
    const error = await cloneVmFromSnapshot({
      name: 'restored-vm',
      snapshotId: 'snap-42',
      clusterId: 'cluster-01',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'VM name restored-vm is already in use' })
  })
})

describe('preview / commit / undo snapshot (the try-a-snapshot write flow)', () => {
  it('previewSnapshot POSTs the snapshot id to /vms/{id}/previewsnapshot', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(previewSnapshot('vm-01', 'snap-01')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/previewsnapshot')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ snapshot: { id: 'snap-01' } })
  })

  it('commitSnapshot and undoSnapshot POST an empty body to their sub-actions', async () => {
    const commit = mockFetch(200, {})
    await commitSnapshot('vm-01')
    const [commitUrl, commitInit] = commit.mock.calls[0] as [string, RequestInit]
    expect(commitUrl).toBe('/ovirt-engine/api/vms/vm-01/commitsnapshot')
    expect(commitInit.body).toBe('{}')
    vi.unstubAllGlobals()

    const undo = mockFetch(200, {})
    await undoSnapshot('vm-01')
    const [undoUrl, undoInit] = undo.mock.calls[0] as [string, RequestInit]
    expect(undoUrl).toBe('/ovirt-engine/api/vms/vm-01/undosnapshot')
    expect(undoInit.body).toBe('{}')
  })
})
