import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDirectLunDisk, createVmDirectLunDisk } from './resources/disks'
import { DiskAttachmentSchema, DiskSchema, diskSizeBytes } from './schemas/disk'
import { mockRequest, resetMockVms } from './mock/handlers'
import { ApiError, type RequestOptions } from './transport'
import { clearSessionToken, setSessionToken } from './session'

const GiB = 1024 ** 3

// The free iSCSI / FC LUNs the host-01 mock fixture exposes, plus the one
// already backing storage domain sd-02 (see handlers.ts initialHostStorage).
const FREE_ISCSI_LUN = '36001405abcdef0000000000000000001'
const SD_BACKED_LUN = '36001405abcdef0000000000000000002'
const FREE_FC_LUN = '3600a098038303053422b4b6a59684441'

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

// --- Request-shape tests (stubbed fetch) -------------------------------------
describe('direct-LUN request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('createDirectLunDisk POSTs /disks with lun_storage and NO image fields (iSCSI coordinates ride)', async () => {
    const fetchMock = mockFetch(201, { id: 'disk-lun-1', status: 'ok' })
    await createDirectLunDisk({
      alias: 'san-vol',
      description: 'db LUN',
      shareable: true,
      wipeAfterDelete: true,
      lun: {
        type: 'iscsi',
        id: FREE_ISCSI_LUN,
        address: '10.35.1.10',
        port: 3260,
        target: 'iqn.2015-01.com.example:storage.target0',
      },
    })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks')
    expect(init.method).toBe('POST')
    // No provisioned_size/format/sparse/storage_domains — a LUN disk has no image.
    expect(JSON.parse(init.body as string)).toEqual({
      alias: 'san-vol',
      description: 'db LUN',
      shareable: true,
      wipe_after_delete: true,
      lun_storage: {
        type: 'iscsi',
        logical_units: {
          logical_unit: [
            {
              id: FREE_ISCSI_LUN,
              address: '10.35.1.10',
              port: 3260,
              target: 'iqn.2015-01.com.example:storage.target0',
            },
          ],
        },
      },
    })
  })

  it('createDirectLunDisk sends a bare LUN id for FC and defaults the flags off', async () => {
    const fetchMock = mockFetch(201, { id: 'disk-lun-1', status: 'ok' })
    await createDirectLunDisk({
      alias: 'fc-vol',
      lun: { type: 'fcp', id: FREE_FC_LUN },
    })

    expect(JSON.parse(lastRequest(fetchMock)[1].body as string)).toEqual({
      alias: 'fc-vol',
      shareable: false,
      wipe_after_delete: false,
      lun_storage: {
        type: 'fcp',
        logical_units: { logical_unit: [{ id: FREE_FC_LUN }] },
      },
    })
  })

  it('createVmDirectLunDisk POSTs the diskattachment with the lun_storage disk inline', async () => {
    const fetchMock = mockFetch(201, {})
    await createVmDirectLunDisk('vm-01', {
      alias: 'san-vol',
      bootable: true,
      lun: {
        type: 'iscsi',
        id: FREE_ISCSI_LUN,
        address: '10.35.1.10',
        port: 3260,
        target: 'iqn.2015-01.com.example:storage.target0',
      },
    })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/diskattachments')
    expect(init.method).toBe('POST')
    // Attachment scalars on top (createVmDisk defaults), the LUN disk nested.
    expect(JSON.parse(init.body as string)).toEqual({
      active: true,
      bootable: true,
      interface: 'virtio_scsi',
      disk: {
        alias: 'san-vol',
        shareable: false,
        wipe_after_delete: false,
        lun_storage: {
          type: 'iscsi',
          logical_units: {
            logical_unit: [
              {
                id: FREE_ISCSI_LUN,
                address: '10.35.1.10',
                port: 3260,
                target: 'iqn.2015-01.com.example:storage.target0',
              },
            ],
          },
        },
      },
    })
  })
})

// --- Schema coercion ----------------------------------------------------------
describe('direct-LUN schema coercion', () => {
  it('DiskSchema coerces lun_storage LUN scalars from their JSON-string forms', () => {
    const disk = DiskSchema.parse({
      id: 'disk-lun-1',
      alias: 'san-vol',
      status: 'ok',
      storage_type: 'lun',
      provisioned_size: '0',
      shareable: 'true',
      lun_storage: {
        type: 'iscsi',
        logical_units: {
          logical_unit: [
            {
              id: FREE_ISCSI_LUN,
              address: '10.35.1.10',
              port: '3260',
              target: 'iqn.2015-01.com.example:storage.target0',
              size: `${100 * GiB}`,
            },
          ],
        },
      },
    })

    const lun = disk.lun_storage?.logical_units?.logical_unit?.[0]
    expect(lun?.port).toBe(3260)
    expect(lun?.size).toBe(100 * GiB)
    expect(disk.shareable).toBe(true)
  })

  it('diskSizeBytes falls back to the bound LUN size when the disk has no image size', () => {
    const lunDisk = {
      provisioned_size: 0,
      lun_storage: { logical_units: { logical_unit: [{ id: 'lun-1', size: 42 * GiB }] } },
    }
    expect(diskSizeBytes(lunDisk)).toBe(42 * GiB)
    // an image disk keeps its own provisioned_size
    expect(diskSizeBytes({ provisioned_size: 10 * GiB })).toBe(10 * GiB)
    // nothing to report
    expect(diskSizeBytes(undefined)).toBeUndefined()
  })

  it('DiskAttachmentSchema carries lun_storage on the followed disk', () => {
    const attachment = DiskAttachmentSchema.parse({
      id: 'vm-08-da-2',
      bootable: 'false',
      disk: {
        id: 'vm-08-disk-2',
        storage_type: 'lun',
        lun_storage: {
          type: 'iscsi',
          logical_units: { logical_unit: [{ id: 'lun-9', size: `${200 * GiB}` }] },
        },
      },
    })
    expect(diskSizeBytes(attachment.disk)).toBe(200 * GiB)
  })
})

// --- Mock handler tests (fake timers, real mockRequest) ------------------------
describe('direct-LUN mock handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
    resetMockVms()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    clearSessionToken()
  })

  // Settle the mock's simulated latency (300ms) — same helper as
  // disk-features.test.ts. LUN creates have no further settle timers.
  async function call(path: string, opts: RequestOptions = {}): Promise<unknown> {
    const promise = mockRequest(path, opts).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  const lunCreateBody = (lunId: string) => ({
    alias: 'san-vol',
    shareable: false,
    wipe_after_delete: false,
    lun_storage: {
      type: 'iscsi',
      logical_units: { logical_unit: [{ id: lunId, address: '10.35.1.10', port: 3260 }] },
    },
  })

  it('POST /disks with lun_storage creates an ok LUN disk sized from the fixture LUN, with no storage domain', async () => {
    const created = (await call('/disks', {
      method: 'POST',
      body: lunCreateBody(FREE_ISCSI_LUN),
    })) as {
      id: string
      status?: string
      storage_type?: string
      provisioned_size?: number
      storage_domains?: unknown
      lun_storage?: { logical_units?: { logical_unit?: { id?: string }[] } }
    }
    expect(created).not.toBeInstanceOf(ApiError)
    // LUN disks bind synchronously — no locked settle
    expect(created.status).toBe('ok')
    expect(created.storage_type).toBe('lun')
    // size comes from the fixture LUN (100 GiB), not the request
    expect(Number(created.provisioned_size)).toBe(100 * GiB)
    expect(created.storage_domains).toBeUndefined()
    expect(created.lun_storage?.logical_units?.logical_unit?.[0]?.id).toBe(FREE_ISCSI_LUN)

    // it surfaces in the flat collection and the detail read, still without an SD
    const list = (await call('/disks')) as { disk: { id: string; storage_type?: string }[] }
    expect(list.disk.find((d) => d.id === created.id)?.storage_type).toBe('lun')
    const detail = (await call(`/disks/${created.id}`)) as { storage_domains?: unknown }
    expect(detail).not.toBeInstanceOf(ApiError)
    expect(detail.storage_domains).toBeUndefined()
  })

  it('marks the claimed LUN with disk_id so the SAN picker greys it', async () => {
    const created = (await call('/disks', {
      method: 'POST',
      body: lunCreateBody(FREE_ISCSI_LUN),
    })) as { id: string }

    const storage = (await call('/hosts/host-01/storage')) as {
      host_storage: { logical_units?: { logical_unit?: { id: string; disk_id?: string }[] } }[]
    }
    const luns = storage.host_storage.flatMap((e) => e.logical_units?.logical_unit ?? [])
    expect(luns.find((l) => l.id === FREE_ISCSI_LUN)?.disk_id).toBe(created.id)
  })

  it('409s a second create against the same LUN and one against an SD-backed LUN', async () => {
    const first = await call('/disks', { method: 'POST', body: lunCreateBody(FREE_ISCSI_LUN) })
    expect(first).not.toBeInstanceOf(ApiError)

    const again = await call('/disks', { method: 'POST', body: lunCreateBody(FREE_ISCSI_LUN) })
    expect(again).toBeInstanceOf(ApiError)
    expect((again as ApiError).status).toBe(409)

    const sdBacked = await call('/disks', { method: 'POST', body: lunCreateBody(SD_BACKED_LUN) })
    expect(sdBacked).toBeInstanceOf(ApiError)
    expect((sdBacked as ApiError).status).toBe(409)
  })

  it('400s a create whose LUN no host can see', async () => {
    const unknown = await call('/disks', { method: 'POST', body: lunCreateBody('no-such-lun') })
    expect(unknown).toBeInstanceOf(ApiError)
    expect((unknown as ApiError).status).toBe(400)
  })

  it('POST /vms/{id}/diskattachments with an inline lun_storage disk attaches a LUN disk', async () => {
    const created = (await call('/vms/vm-01/diskattachments', {
      method: 'POST',
      body: {
        active: true,
        bootable: false,
        interface: 'virtio_scsi',
        disk: lunCreateBody(FREE_FC_LUN),
      },
    })) as { id: string; disk?: { id?: string; storage_type?: string } }
    expect(created).not.toBeInstanceOf(ApiError)
    expect(created.disk?.storage_type).toBe('lun')

    // the attachment surfaces on the VM list read with the LUN size
    const attachments = (await call('/vms/vm-01/diskattachments')) as {
      disk_attachment: {
        disk?: { id?: string; storage_type?: string; provisioned_size?: number }
      }[]
    }
    const row = attachments.disk_attachment.find((a) => a.disk?.id === created.disk?.id)
    expect(row?.disk?.storage_type).toBe('lun')
    expect(Number(row?.disk?.provisioned_size)).toBe(500 * GiB)

    // and in the flat /disks collection it keeps storage_type 'lun'
    const list = (await call('/disks')) as { disk: { id: string; storage_type?: string }[] }
    expect(list.disk.find((d) => d.id === created.disk?.id)?.storage_type).toBe('lun')
  })

  it('DELETE /disks/{id} on a direct-LUN disk frees the LUN for a new create', async () => {
    const created = (await call('/disks', {
      method: 'POST',
      body: lunCreateBody(FREE_ISCSI_LUN),
    })) as { id: string }
    const removed = await call(`/disks/${created.id}`, { method: 'DELETE' })
    expect(removed).not.toBeInstanceOf(ApiError)

    const recreate = await call('/disks', { method: 'POST', body: lunCreateBody(FREE_ISCSI_LUN) })
    expect(recreate).not.toBeInstanceOf(ApiError)
  })

  it('resetMockVms releases claimed LUNs', async () => {
    await call('/disks', { method: 'POST', body: lunCreateBody(FREE_ISCSI_LUN) })
    resetMockVms()
    const retry = await call('/disks', { method: 'POST', body: lunCreateBody(FREE_ISCSI_LUN) })
    expect(retry).not.toBeInstanceOf(ApiError)
  })
})
