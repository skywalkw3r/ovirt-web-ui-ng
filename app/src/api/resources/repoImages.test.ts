import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importImage } from './repoImages'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — same shape as resources/users.test.ts. Assert
// the URL/method/body the resource emits.
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

describe('importImage', () => {
  it('POSTs the async disk-import action with only the mandatory storage domain', async () => {
    const fetchMock = mockFetch(200, {})

    await importImage('sd-glance', 'img-01', { storageDomainId: 'sd-data' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/storagedomains/sd-glance/images/img-01/import')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      storage_domain: { id: 'sd-data' },
      async: true,
    })
  })

  it('carries cluster + template name only on the import-as-template leg', async () => {
    const fetchMock = mockFetch(200, {})

    await importImage('sd-glance', 'img-01', {
      storageDomainId: 'sd-data',
      importAsTemplate: true,
      clusterId: 'cluster-01',
      templateName: 'fedora-template',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      storage_domain: { id: 'sd-data' },
      async: true,
      import_as_template: true,
      cluster: { id: 'cluster-01' },
      template: { name: 'fedora-template' },
    })
  })

  it('omits cluster when the disk leg is taken even if a cluster id is supplied', async () => {
    const fetchMock = mockFetch(200, {})
    // api-model ImageService.Import reads cluster only when import_as_template
    // is true, so the disk leg never sends one
    await importImage('sd-glance', 'img-02', {
      storageDomainId: 'sd-data',
      clusterId: 'cluster-01',
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      storage_domain: { id: 'sd-data' },
      async: true,
    })
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(400, { fault: { reason: 'Operation Failed', detail: 'Cannot import image' } })
    const error = await importImage('sd-glance', 'img-01', { storageDomainId: 'sd-data' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: 'Cannot import image' })
  })
})
