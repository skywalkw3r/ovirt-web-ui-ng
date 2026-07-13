import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getIcon, iconDataUrl, listIcons, vmLargeIconId } from './icons'
import type { Vm } from '../schemas/vm'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (mirrors the mockFetch helper in the sibling
// resource tests) so these cover the exact path/verb without the mock engine.
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

describe('listIcons', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /icons and returns the catalog, coercing the loose Icon shape', async () => {
    const fetchMock = mockFetch(200, {
      icon: [
        { id: 'icon-linux', media_type: 'image/png', data: 'AAAA' },
        { id: 'icon-win', media_type: 'image/png', data: 'BBBB' },
      ],
    })

    const icons = await listIcons()

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/icons')
    expect(icons).toHaveLength(2)
    expect(icons[0]).toMatchObject({ id: 'icon-linux', media_type: 'image/png', data: 'AAAA' })
  })

  it('returns [] when the icon key is omitted (empty catalog)', async () => {
    mockFetch(200, {})
    await expect(listIcons()).resolves.toEqual([])
  })

  it('degrades a 404 catalog to [] rather than throwing', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no icons' } })
    await expect(listIcons()).resolves.toEqual([])
  })

  it('surfaces a 5xx fault as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })
    const error = await listIcons().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500, message: 'boom' })
  })
})

describe('getIcon', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /icons/{id} and parses the single icon', async () => {
    const fetchMock = mockFetch(200, { id: 'icon-42', media_type: 'image/jpeg', data: 'ZZZZ' })

    const icon = await getIcon('icon-42')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/icons/icon-42')
    expect(icon).toMatchObject({ id: 'icon-42', media_type: 'image/jpeg', data: 'ZZZZ' })
  })
})

describe('vmLargeIconId / iconDataUrl helpers', () => {
  it('reads the passthrough large_icon.id off a VM', () => {
    const vm = { id: 'vm-1', name: 'web', large_icon: { id: 'icon-linux' } } as unknown as Vm
    expect(vmLargeIconId(vm)).toBe('icon-linux')
  })

  it('returns undefined when the VM carries no large_icon reference', () => {
    const vm = { id: 'vm-1', name: 'web' } as unknown as Vm
    expect(vmLargeIconId(vm)).toBeUndefined()
  })

  it('builds a data URI from an icon with inline data', () => {
    expect(iconDataUrl({ media_type: 'image/png', data: 'AAAA' })).toBe(
      'data:image/png;base64,AAAA',
    )
  })

  it('returns undefined for an icon that is a bare link stub (no data)', () => {
    expect(iconDataUrl({ id: 'icon-1' })).toBeUndefined()
    expect(iconDataUrl(undefined)).toBeUndefined()
  })
})
