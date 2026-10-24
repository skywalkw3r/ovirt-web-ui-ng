import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelImageTransfer,
  copyDisk,
  createDisk,
  createImageTransfer,
  finalizeImageTransfer,
  getImageTransfer,
  moveDisk,
  sparsifyDisk,
} from './resources/disks'
import { mockRequest, resetMockVms } from './mock/handlers'
import { ApiError, type RequestOptions } from './transport'
import { clearSessionToken, setSessionToken } from './session'

const GiB = 1024 ** 3

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
describe('disk-feature request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('moveDisk POSTs the target storage domain', async () => {
    const fetchMock = mockFetch(202, {})
    await moveDisk('disk-1', 'sd-target')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks/disk-1/move')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ storage_domain: { id: 'sd-target' } })
  })

  it('copyDisk POSTs the target SD and omits disk.name when no alias is given', async () => {
    const fetchMock = mockFetch(202, {})
    await copyDisk('disk-1', { storageDomainId: 'sd-target' })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks/disk-1/copy')
    expect(JSON.parse(init.body as string)).toEqual({ storage_domain: { id: 'sd-target' } })
  })

  it('copyDisk includes disk.name when an alias is given', async () => {
    const fetchMock = mockFetch(202, {})
    await copyDisk('disk-1', { storageDomainId: 'sd-target', name: 'clone' })

    const [, init] = lastRequest(fetchMock)
    expect(JSON.parse(init.body as string)).toEqual({
      storage_domain: { id: 'sd-target' },
      disk: { name: 'clone' },
    })
  })

  it('sparsifyDisk POSTs an empty body', async () => {
    const fetchMock = mockFetch(202, {})
    await sparsifyDisk('disk-1')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks/disk-1/sparsify')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('createDisk POSTs a floating disk with format, sparse and storage domain', async () => {
    const fetchMock = mockFetch(202, { id: 'disk-new', status: 'locked' })
    await createDisk({
      alias: 'upload.qcow2',
      format: 'cow',
      sparse: true,
      provisionedSize: 5 * GiB,
      contentType: 'data',
      storageDomainId: 'sd-01',
    })

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/disks')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      alias: 'upload.qcow2',
      format: 'cow',
      sparse: true,
      provisioned_size: 5 * GiB,
      content_type: 'data',
      storage_domains: { storage_domain: [{ id: 'sd-01' }] },
    })
  })

  it('createImageTransfer POSTs the disk link and direction', async () => {
    const fetchMock = mockFetch(201, { id: 'tr-1', phase: 'initializing' })
    await createImageTransfer('disk-new', 'upload')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/imagetransfers')
    expect(JSON.parse(init.body as string)).toEqual({
      disk: { id: 'disk-new' },
      direction: 'upload',
    })
  })

  // deleteDisk wire shape (DELETE /disks/{id}, no body) + its 404 path live in
  // the canonical disks-crud.test.ts; not duplicated here.

  it('finalizeImageTransfer POSTs to the finalize sub-action', async () => {
    const fetchMock = mockFetch(200, {})
    await finalizeImageTransfer('tr-1')
    expect(lastRequest(fetchMock)[0]).toBe('/ovirt-engine/api/imagetransfers/tr-1/finalize')
  })

  it('cancelImageTransfer POSTs to the cancel sub-action', async () => {
    const fetchMock = mockFetch(200, {})
    await cancelImageTransfer('tr-1')
    expect(lastRequest(fetchMock)[0]).toBe('/ovirt-engine/api/imagetransfers/tr-1/cancel')
  })
})

// --- Mock lifecycle tests (fake timers, real mockRequest) --------------------
describe('disk-feature mock handlers', () => {
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

  // Settle the short latency timer without reaching the longer transition timers.
  async function call(path: string, opts: RequestOptions = {}): Promise<unknown> {
    const promise = mockRequest(path, opts).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function diskStatus(id: string): Promise<string | undefined> {
    const detail = (await call(`/disks/${id}`)) as { status?: string } | ApiError
    return detail instanceof ApiError ? undefined : detail.status
  }

  // Create a floating upload disk and settle it to `ok`. The engine mints it
  // `locked` while it allocates, and a transfer opened against a still-locked
  // disk is rejected — so the upload flow waits for the disk before opening the
  // transfer, and these tests do the same (advance past DISK_SETTLE_MS = 3s).
  async function createSettledUploadDisk(alias: string, sizeBytes: number): Promise<string> {
    const disk = (await call('/disks', {
      method: 'POST',
      body: {
        alias,
        format: 'cow',
        sparse: true,
        provisioned_size: sizeBytes,
        content_type: 'data',
        storage_domains: { storage_domain: [{ id: 'sd-01' }] },
      },
    })) as { id: string; status?: string }
    expect(disk.status).toBe('locked')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await diskStatus(disk.id)).toBe('ok')
    return disk.id
  }

  it('move retargets the storage domain and settles locked → ok', async () => {
    const result = await call('/disks/disk-orphaned-backup/move', {
      method: 'POST',
      body: { storage_domain: { id: 'sd-03' } },
    })
    expect(result).not.toBeInstanceOf(ApiError)
    expect(await diskStatus('disk-orphaned-backup')).toBe('locked')

    await vi.advanceTimersByTimeAsync(4_000)
    expect(await diskStatus('disk-orphaned-backup')).toBe('ok')
    const detail = (await call('/disks/disk-orphaned-backup')) as {
      storage_domains?: { storage_domain?: { id?: string }[] }
    }
    expect(detail.storage_domains?.storage_domain?.[0]?.id).toBe('sd-03')
  })

  it('copy mints a new locked disk in the flat collection that settles to ok', async () => {
    await call('/disks/disk-orphaned-backup/copy', {
      method: 'POST',
      body: { storage_domain: { id: 'sd-01' }, disk: { name: 'backup-clone' } },
    })
    const before = (await call('/disks')) as {
      disk: { id: string; name?: string; status?: string }[]
    }
    const clone = before.disk.find((d) => d.name === 'backup-clone')
    expect(clone?.status).toBe('locked')

    await vi.advanceTimersByTimeAsync(4_000)
    const after = (await call('/disks')) as { disk: { name?: string; status?: string }[] }
    expect(after.disk.find((d) => d.name === 'backup-clone')?.status).toBe('ok')
  })

  it('sparsify settles locked → ok and shrinks actual_size', async () => {
    // Capture the primitive now — the mock returns fixture objects by reference,
    // so holding the object would see the later in-place actual_size mutation.
    const beforeActual = Number(
      ((await call('/disks/disk-orphaned-backup')) as { actual_size?: number }).actual_size,
    )
    await call('/disks/disk-orphaned-backup/sparsify', { method: 'POST', body: {} })
    expect(await diskStatus('disk-orphaned-backup')).toBe('locked')

    await vi.advanceTimersByTimeAsync(4_000)
    const after = (await call('/disks/disk-orphaned-backup')) as {
      status?: string
      actual_size?: number
    }
    expect(after.status).toBe('ok')
    expect(Number(after.actual_size)).toBeLessThan(beforeActual)
  })

  it('rejects move/copy/sparsify on a locked disk with 409', async () => {
    // First move locks the disk mid-op.
    await call('/disks/disk-orphaned-backup/move', {
      method: 'POST',
      body: { storage_domain: { id: 'sd-03' } },
    })
    expect(await diskStatus('disk-orphaned-backup')).toBe('locked')

    for (const action of ['move', 'copy', 'sparsify']) {
      const error = await call(`/disks/disk-orphaned-backup/${action}`, {
        method: 'POST',
        body: { storage_domain: { id: 'sd-01' } },
      })
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(409)
    }
  })

  it('image transfer create → poll → finalize walks the phase machine to finished_success', async () => {
    // Create the floating upload target and let it settle to `ok` (a transfer
    // against a still-locked disk is rejected — see createSettledUploadDisk).
    const diskId = await createSettledUploadDisk('seed.qcow2', 2 * GiB)

    const transfer = (await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: diskId }, direction: 'upload' },
    })) as { id: string; phase: string; proxy_url?: string }
    expect(transfer.phase).toBe('initializing')
    expect(transfer.proxy_url).toBeUndefined()

    // Advance to `transferring`; proxy_url appears.
    await vi.advanceTimersByTimeAsync(4_000)
    const transferring = (await call(`/imagetransfers/${transfer.id}`)) as {
      phase: string
      proxy_url?: string
    }
    expect(transferring.phase).toBe('transferring')
    expect(transferring.proxy_url).toMatch(/^https:\/\/mock-proxy\.invalid\//)

    // Finalize → finalizing_success → finished_success.
    await call(`/imagetransfers/${transfer.id}/finalize`, { method: 'POST', body: {} })
    const finalizing = (await call(`/imagetransfers/${transfer.id}`)) as { phase: string }
    expect(finalizing.phase).toBe('finalizing_success')

    await vi.advanceTimersByTimeAsync(4_000)
    const finished = (await call(`/imagetransfers/${transfer.id}`)) as { phase: string }
    expect(finished.phase).toBe('finished_success')
    expect(await diskStatus(diskId)).toBe('ok')
  })

  it('image transfer cancel removes the partial disk and walks to finished_cleanup', async () => {
    const diskId = await createSettledUploadDisk('aborted.qcow2', 1 * GiB)

    const transfer = (await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: diskId }, direction: 'upload' },
    })) as { id: string }

    await call(`/imagetransfers/${transfer.id}/cancel`, { method: 'POST', body: {} })
    const cancelled = (await call(`/imagetransfers/${transfer.id}`)) as { phase: string }
    expect(cancelled.phase).toBe('cancelled_user')

    // The partial disk is gone from the flat collection and 404s on detail read.
    const list = (await call('/disks')) as { disk: { id: string }[] }
    expect(list.disk.some((d) => d.id === diskId)).toBe(false)
    expect(await diskStatus(diskId)).toBeUndefined()

    await vi.advanceTimersByTimeAsync(4_000)
    const cleaned = (await call(`/imagetransfers/${transfer.id}`)) as { phase: string }
    expect(cleaned.phase).toBe('finished_cleanup')
  })

  it('getImageTransfer parses the transfer through the schema', async () => {
    const diskId = await createSettledUploadDisk('parse.qcow2', 1 * GiB)
    const created = (await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: diskId }, direction: 'upload' },
    })) as { id: string }

    // getImageTransfer routes through request()/mockRequest under VITE_MOCK.
    const promise = getImageTransfer(created.id).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    const parsed = (await promise) as { id: string; phase?: string }
    expect(parsed.id).toBe(created.id)
    expect(parsed.phase).toBe('initializing')
  })

  it('rejects an image transfer opened against a still-locked disk with 409', async () => {
    // Create the disk but do NOT settle it — it's still `locked`.
    const disk = (await call('/disks', {
      method: 'POST',
      body: {
        alias: 'racy.qcow2',
        format: 'cow',
        sparse: true,
        provisioned_size: 1 * GiB,
        content_type: 'data',
        storage_domains: { storage_domain: [{ id: 'sd-01' }] },
      },
    })) as { id: string; status?: string }
    expect(disk.status).toBe('locked')

    const error = await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: disk.id }, direction: 'upload' },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)

    // Once the disk settles to `ok`, the transfer opens.
    await vi.advanceTimersByTimeAsync(3_000)
    const transfer = (await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: disk.id }, direction: 'upload' },
    })) as { id: string; phase: string }
    expect(transfer.phase).toBe('initializing')
  })

  it('rejects an image transfer against an unknown disk with 404', async () => {
    const error = await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: 'no-such-disk' }, direction: 'upload' },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })

  it('deletes a floating disk and 404s a subsequent detail read', async () => {
    const diskId = await createSettledUploadDisk('reap-me.qcow2', 1 * GiB)

    const result = await call(`/disks/${diskId}`, { method: 'DELETE' })
    expect(result).not.toBeInstanceOf(ApiError)

    // Gone from the flat collection and 404s on detail read.
    const list = (await call('/disks')) as { disk: { id: string }[] }
    expect(list.disk.some((d) => d.id === diskId)).toBe(false)
    expect(await diskStatus(diskId)).toBeUndefined()
  })

  it('deleting an unknown disk 404s', async () => {
    const error = await call('/disks/no-such-disk', { method: 'DELETE' })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })
})
