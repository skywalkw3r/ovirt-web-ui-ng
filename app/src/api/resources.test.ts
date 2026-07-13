import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
} from './resources/snapshots'
import { listVmDisks } from './resources/disks'
import { listVmNics } from './resources/nics'
import { mockRequest, resetMockVms } from './mock/handlers'
import { ApiError, type RequestOptions } from './transport'
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

describe('snapshot resources', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('createSnapshot POSTs description and persist_memorystate to /vms/{id}/snapshots', async () => {
    const fetchMock = mockFetch(200, { id: 'snap-1', snapshot_status: 'locked' })
    await expect(createSnapshot('vm-01', 'pre-upgrade', false)).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/snapshots')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      description: 'pre-upgrade',
      persist_memorystate: false,
    })
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('restoreSnapshot POSTs an empty JSON object to /vms/{id}/snapshots/{id}/restore', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(restoreSnapshot('vm-01', 'snap-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/snapshots/snap-1/restore')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
  })

  it('deleteSnapshot sends a bodiless DELETE to /vms/{id}/snapshots/{id}', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(deleteSnapshot('vm-01', 'snap-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/snapshots/snap-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('listSnapshots parses the list and coerces string scalars', async () => {
    mockFetch(200, {
      snapshot: [
        {
          id: 'snap-1',
          description: 'Active VM',
          snapshot_type: 'active',
          snapshot_status: 'ok',
          date: '1750000000000',
          persist_memorystate: 'false',
        },
      ],
    })

    const snapshots = await listSnapshots('vm-01')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].date).toBe(1750000000000)
    expect(snapshots[0].persist_memorystate).toBe(false)
  })

  it('listSnapshots handles the empty-list quirk (missing "snapshot" key)', async () => {
    mockFetch(200, {})
    await expect(listSnapshots('vm-01')).resolves.toEqual([])
  })
})

describe('listVmDisks', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vms/{id}/diskattachments?follow=disk and coerces string sizes', async () => {
    const fetchMock = mockFetch(200, {
      disk_attachment: [
        {
          id: 'da-1',
          bootable: 'true',
          interface: 'virtio_scsi',
          active: true,
          disk: {
            id: 'disk-1',
            name: 'web-01_root',
            provisioned_size: '53687091200',
            actual_size: '24696061952',
            status: 'ok',
            format: 'cow',
          },
        },
      ],
    })

    const attachments = await listVmDisks('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/vms/vm-01/diskattachments?follow=disk',
    )
    expect(attachments[0].bootable).toBe(true)
    expect(attachments[0].disk?.provisioned_size).toBe(53687091200)
    expect(attachments[0].disk?.actual_size).toBe(24696061952)
  })

  it('handles the empty-list quirk (missing "disk_attachment" key)', async () => {
    mockFetch(200, {})
    await expect(listVmDisks('vm-01')).resolves.toEqual([])
  })
})

describe('listVmNics', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vms/{id}/nics and parses MAC and boolean-ish flags', async () => {
    const fetchMock = mockFetch(200, {
      nic: [
        {
          id: 'nic-1',
          name: 'nic1',
          plugged: 'true',
          linked: false,
          mac: { address: '56:6f:1a:2b:01:01' },
        },
      ],
    })

    const nics = await listVmNics('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/nics')
    expect(nics[0].mac?.address).toBe('56:6f:1a:2b:01:01')
    expect(nics[0].plugged).toBe(true)
    expect(nics[0].linked).toBe(false)
  })
})

describe('mock VM sub-resources', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockVms()
  })
  afterEach(() => vi.useRealTimers())

  // Every mock response sits behind a short latency timer; settle it without
  // reaching the multi-second state-transition timers.
  async function call(path: string, opts?: RequestOptions): Promise<unknown> {
    const promise = mockRequest(path, opts).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('serves the ever-present Active VM snapshot plus per-VM extras', async () => {
    const { snapshot } = (await call('/vms/vm-01/snapshots')) as {
      snapshot: Array<{ description: string; snapshot_type: string }>
    }
    expect(snapshot[0]).toMatchObject({ description: 'Active VM', snapshot_type: 'active' })
    expect(snapshot.length).toBeGreaterThan(1)
  })

  it('rejects deleting the Active VM snapshot with a 409', async () => {
    const error = await call('/vms/vm-01/snapshots/vm-01-snap-active', { method: 'DELETE' })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)

    const { snapshot } = (await call('/vms/vm-01/snapshots')) as { snapshot: unknown[] }
    expect(snapshot).toHaveLength(3)
  })

  it('rejects restoring the Active VM snapshot with a 409', async () => {
    const error = await call('/vms/vm-01/snapshots/vm-01-snap-active/restore', { method: 'POST' })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
  })

  it('create appends a locked snapshot that settles to ok after the timer', async () => {
    await call('/vms/vm-02/snapshots', {
      method: 'POST',
      body: { description: 'pre-upgrade', persist_memorystate: true },
    })

    let { snapshot } = (await call('/vms/vm-02/snapshots')) as {
      snapshot: Array<{ description?: string; snapshot_status?: string }>
    }
    expect(snapshot.at(-1)).toMatchObject({
      description: 'pre-upgrade',
      snapshot_status: 'locked',
    })

    await vi.advanceTimersByTimeAsync(3_000)
    ;({ snapshot } = (await call('/vms/vm-02/snapshots')) as {
      snapshot: Array<{ description?: string; snapshot_status?: string }>
    })
    expect(snapshot.at(-1)).toMatchObject({ snapshot_status: 'ok' })
  })

  it('restore locks the VM image briefly and then returns it to its prior status', async () => {
    await call('/vms/vm-01/snapshots/vm-01-snap-1/restore', { method: 'POST' })
    expect(await call('/vms/vm-01')).toMatchObject({ status: 'image_locked' })

    await vi.advanceTimersByTimeAsync(4_000)
    expect(await call('/vms/vm-01')).toMatchObject({ status: 'up' })
  })

  it('delete removes a regular snapshot', async () => {
    await call('/vms/vm-03/snapshots/vm-03-snap-1', { method: 'DELETE' })

    const { snapshot } = (await call('/vms/vm-03/snapshots')) as {
      snapshot: Array<{ id: string }>
    }
    expect(snapshot.map((s) => s.id)).toEqual(['vm-03-snap-active'])
  })

  it('404s snapshot writes for unknown VMs and unknown snapshot ids', async () => {
    const noVm = await call('/vms/no-such-vm/snapshots', { method: 'POST', body: {} })
    expect((noVm as ApiError).status).toBe(404)

    const noSnap = await call('/vms/vm-01/snapshots/no-such-snap', { method: 'DELETE' })
    expect((noSnap as ApiError).status).toBe(404)
  })

  it('serves disk attachments and nics per VM', async () => {
    const { disk_attachment } = (await call('/vms/vm-03/diskattachments')) as {
      disk_attachment: Array<{ disk?: { name?: string } }>
    }
    expect(disk_attachment).toHaveLength(2)
    expect(disk_attachment[1].disk?.name).toBe('db-01_pgdata')

    const { nic } = (await call('/vms/vm-03/nics')) as {
      nic: Array<{ mac?: { address?: string } }>
    }
    expect(nic).toHaveLength(2)
    expect(nic[0].mac?.address).toMatch(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)
  })

  it('still dispatches method-less legacy calls by path alone', async () => {
    await call('/vms/vm-08/start')
    expect(await call('/vms/vm-08')).toMatchObject({ status: 'powering_up' })
  })
})
