import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportVm } from './vms'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (mirrors the mockFetch helper in
// api/resources/users.test.ts / vm-actions.test.ts) so these cover the wire
// shape without reaching the mock engine.
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

describe('exportVm', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs storage_domain + async to /vms/{id}/export and omits the off knobs', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(exportVm('vm-01', { storageDomainId: 'sd-export-01' })).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/export')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      storage_domain: { id: 'sd-export-01' },
      async: true,
    })
  })

  it('rides discard_snapshots and exclusive only when the switches are on', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await exportVm('vm-01', {
      storageDomainId: 'sd-export-01',
      discardSnapshots: true,
      exclusive: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      storage_domain: { id: 'sd-export-01' },
      async: true,
      discard_snapshots: true,
      exclusive: true,
    })
  })

  it('encodes the id in the path', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await exportVm('vm/01', { storageDomainId: 'sd-export-01' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm%2F01/export')
  })

  it('surfaces an engine fault (e.g. a running VM) verbatim as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Cannot export. VM is running.' },
    })
    const error = await exportVm('vm-01', { storageDomainId: 'sd-export-01' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Cannot export. VM is running.' })
  })
})
