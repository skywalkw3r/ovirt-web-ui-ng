import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createImageTransfer, getImageTransfer } from './resources/disks'
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
// The download leg reuses the shared imageio resource fns; these pin the wire
// shape of a direction:'download' transfer and its finalize/cancel teardown.
describe('disk-download request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('createImageTransfer POSTs the disk link and download direction', async () => {
    const fetchMock = mockFetch(201, { id: 'tr-dl', phase: 'initializing' })
    await createImageTransfer('disk-src', 'download')

    const [url, init] = lastRequest(fetchMock)
    expect(url).toBe('/ovirt-engine/api/imagetransfers')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      disk: { id: 'disk-src' },
      direction: 'download',
    })
  })

  it('createImageTransfer omits format by default but includes it when given', async () => {
    const withoutFormat = mockFetch(201, { id: 'tr-dl', phase: 'initializing' })
    await createImageTransfer('disk-src', 'download')
    expect(JSON.parse(lastRequest(withoutFormat)[1].body as string)).toEqual({
      disk: { id: 'disk-src' },
      direction: 'download',
    })
    vi.unstubAllGlobals()

    const withFormat = mockFetch(201, { id: 'tr-dl', phase: 'initializing' })
    await createImageTransfer('disk-src', 'download', undefined, 'raw')
    expect(JSON.parse(lastRequest(withFormat)[1].body as string)).toEqual({
      disk: { id: 'disk-src' },
      direction: 'download',
      format: 'raw',
    })
  })

  // finalize/cancel carry no `direction`, so their wire shape is identical to
  // the upload leg — covered canonically in disk-features.test.ts, not repeated
  // here. The download-specific finalize teardown is exercised end-to-end in the
  // mock lifecycle test below.
})

// --- Mock lifecycle test (fake timers, real mockRequest) ---------------------
// The mock ignores `direction`, so a download transfer walks the same phase
// machine as upload: this exercises create → transferring (proxy_url appears) →
// finalize → finished_success against a settled `ok` disk.
describe('disk-download mock lifecycle', () => {
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

  // A download targets an existing `ok` image disk. addImageTransfer rejects a
  // still-`locked` disk, so mint a floating disk and let it settle to `ok`
  // (DISK_SETTLE_MS = 3s) before opening the transfer against it.
  async function createSettledDisk(alias: string, sizeBytes: number): Promise<string> {
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

  it('download transfer walks initializing → transferring (proxy_url) → finished_success', async () => {
    const diskId = await createSettledDisk('export-me.qcow2', 2 * GiB)

    const transfer = (await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: diskId }, direction: 'download' },
    })) as { id: string; phase: string; proxy_url?: string }
    expect(transfer.phase).toBe('initializing')
    expect(transfer.proxy_url).toBeUndefined()

    // Advance to `transferring`; the browser-reachable proxy_url (and the daemon
    // transfer_url) appear only now.
    await vi.advanceTimersByTimeAsync(4_000)
    const transferring = (await call(`/imagetransfers/${transfer.id}`)) as {
      phase: string
      proxy_url?: string
      transfer_url?: string
    }
    expect(transferring.phase).toBe('transferring')
    expect(transferring.proxy_url).toMatch(/^https:\/\/mock-proxy\.invalid\//)
    expect(transferring.transfer_url).toMatch(/^https:\/\/mock-daemon\.invalid\//)

    // Finalize closes the session: finalizing_success → finished_success.
    await call(`/imagetransfers/${transfer.id}/finalize`, { method: 'POST', body: {} })
    const finalizing = (await call(`/imagetransfers/${transfer.id}`)) as { phase: string }
    expect(finalizing.phase).toBe('finalizing_success')

    await vi.advanceTimersByTimeAsync(4_000)
    const finished = (await call(`/imagetransfers/${transfer.id}`)) as { phase: string }
    expect(finished.phase).toBe('finished_success')
    // The source disk survives a download and stays `ok`.
    expect(await diskStatus(diskId)).toBe('ok')
  })

  it('getImageTransfer parses a download transfer through the schema', async () => {
    const diskId = await createSettledDisk('parse-dl.qcow2', 1 * GiB)
    const created = (await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: diskId }, direction: 'download' },
    })) as { id: string }

    const promise = getImageTransfer(created.id).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    const parsed = (await promise) as { id: string; phase?: string }
    expect(parsed.id).toBe(created.id)
    expect(parsed.phase).toBe('initializing')
  })

  it('rejects a download transfer against an unknown disk with 404', async () => {
    const error = await call('/imagetransfers', {
      method: 'POST',
      body: { disk: { id: 'no-such-disk' }, direction: 'download' },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })
})
