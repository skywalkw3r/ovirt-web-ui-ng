import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cloneVm,
  exportVmToOva,
  getVm,
  listOperatingSystems,
  listVms,
  performVmAction,
  updateVm,
  type VmAction,
} from './resources/vms'
import { mockRequest, resetMockVms } from './mock/handlers'
import { ApiError } from './transport'
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

describe('performVmAction', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it.each(['start', 'shutdown', 'stop', 'reboot', 'suspend'] as VmAction[])(
    'POSTs an empty JSON object to /vms/{id}/%s and resolves void',
    async (action) => {
      const fetchMock = mockFetch(200, { status: 'complete' })
      await expect(performVmAction('vm-01', action)).resolves.toBeUndefined()

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`/ovirt-engine/api/vms/vm-01/${action}`)
      expect(init.method).toBe('POST')
      expect(init.body).toBe('{}')
      expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    },
  )

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'VM is locked' } })

    const error = await performVmAction('vm-01', 'start').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'VM is locked' })
  })
})

describe('exportVmToOva', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs host + directory (+ optional filename) to /exporttopathonhost', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(
      exportVmToOva('vm-01', { hostId: 'host-01', directory: '/var/tmp/ova', filename: 'web.ova' }),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/exporttopathonhost')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      host: { id: 'host-01' },
      directory: '/var/tmp/ova',
      filename: 'web.ova',
    })
  })

  it('omits filename when not provided', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await exportVmToOva('vm-01', { hostId: 'host-01', directory: '/var/tmp/ova' })
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ host: { id: 'host-01' }, directory: '/var/tmp/ova' })
    expect(body).not.toHaveProperty('filename')
  })
})

// getVm's URL + full scalar-coercion set are covered canonically in
// vm-detail.test.ts; here we cover only its progressive-degradation error
// branch, which nothing else exercised.
describe('getVm degradation', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('drops the host follow (then goes bare) when the fuller read 5xxs', async () => {
    // A fresh/down VM carries no host link, so following it 500s; getVm retries
    // with a narrower follow.
    const fn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ fault: { reason: 'Operation Failed', detail: 'no host' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'vm-09', name: 'fresh', status: 'down' }),
      })
    vi.stubGlobal('fetch', fn)

    const vm = await getVm('vm-09')
    expect(vm.name).toBe('fresh')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/vms/vm-09?follow=cluster,template,host,statistics',
    )
    expect(fn.mock.calls[1]?.[0]).toBe(
      '/ovirt-engine/api/vms/vm-09?follow=cluster,template,statistics',
    )
  })

  it('rethrows a non-5xx error without retrying the follow', async () => {
    const fetchMock = mockFetch(404, { fault: { reason: 'Not Found', detail: 'gone' } })
    await expect(getVm('vm-404')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('updateVm', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('PUTs the changed fields and appends ?next_run=true only when staged', async () => {
    const staged = mockFetch(200, { id: 'vm-01', name: 'web-01' })
    await updateVm('vm-01', { description: 'edited' }, { nextRun: true })
    const [url, init] = staged.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01?next_run=true')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ description: 'edited' })
    vi.unstubAllGlobals()

    // A plain PUT (hot-apply) carries no query.
    const hot = mockFetch(200, { id: 'vm-01', name: 'web-01' })
    await updateVm('vm-01', { description: 'edited' })
    expect(hot.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01')
  })
})

describe('cloneVm', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs {vm} to /clone and rides storage_domain + discard_snapshots only when set', async () => {
    const bare = mockFetch(200, { status: 'complete' })
    await cloneVm('vm-01', { name: 'web-clone' })
    const [url, init] = bare.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/clone')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ vm: { name: 'web-clone' } })
    vi.unstubAllGlobals()

    const full = mockFetch(200, { status: 'complete' })
    await cloneVm(
      'vm-01',
      { name: 'web-clone' },
      { storageDomainId: 'sd-02', discardSnapshots: true },
    )
    const [, fullInit] = full.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(fullInit.body as string)).toEqual({
      vm: { name: 'web-clone' },
      storage_domain: { id: 'sd-02' },
      discard_snapshots: true,
    })
  })
})

describe('listVms', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('emits search and follow as query params', async () => {
    const fetchMock = mockFetch(200, { vm: [] })
    await expect(listVms({ search: 'name=web*', follow: 'tags' })).resolves.toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/vms?search=name%3Dweb*&follow=tags',
    )
  })

  it('degrades to a bare list when the followed read 5xxs', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ fault: { reason: 'Operation Failed', detail: 'boom' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ vm: [{ id: 'vm-01', name: 'web-01' }] }),
      })
    vi.stubGlobal('fetch', fn)

    const vms = await listVms({ follow: 'tags' })
    expect(vms).toHaveLength(1)
    expect(fn.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms?follow=tags')
    expect(fn.mock.calls[1]?.[0]).toBe('/ovirt-engine/api/vms')
  })

  it('does not retry a 5xx on an unfollowed list', async () => {
    const fetchMock = mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })
    await expect(listVms()).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('mock handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockVms()
  })
  afterEach(() => vi.useRealTimers())

  // Every mock response sits behind a short latency timer; settle it without
  // reaching the 4s status-transition timer.
  async function call(path: string): Promise<unknown> {
    const promise = mockRequest(path).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('serves a single VM by id and 404s on unknown ids', async () => {
    const vm = (await call('/vms/vm-01')) as { id: string; status: string }
    expect(vm).toMatchObject({ id: 'vm-01', name: 'web-01', status: 'up' })

    const error = await call('/vms/no-such-vm')
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })

  it('embeds per-VM tags only when the list read follows tags', async () => {
    const bare = (await call('/vms')) as { vm: Array<Record<string, unknown>> }
    expect(bare.vm[0]).not.toHaveProperty('tags')

    const followed = (await call('/vms?follow=tags')) as {
      vm: Array<{ id: string; tags?: { tag?: Array<{ name: string }> } }>
    }
    const byId = new Map(followed.vm.map((vm) => [vm.id, vm]))
    // vm-01 carries a folder tag and a label…
    expect(
      byId
        .get('vm-01')
        ?.tags?.tag?.map((t) => t.name)
        .sort(),
    ).toEqual(['backup-daily', 'web'])
    // …an untagged VM still gets the wrapper with the inner key omitted (the
    // engine's empty-list quirk).
    expect(byId.get('vm-05')?.tags).toEqual({})
  })

  it('start moves a down VM through powering_up to up after the transition delay', async () => {
    await call('/vms/vm-08/start')
    expect(await call('/vms/vm-08')).toMatchObject({ status: 'powering_up' })

    await vi.advanceTimersByTimeAsync(4_000)
    expect(await call('/vms/vm-08')).toMatchObject({ status: 'up' })
  })

  it('shutdown moves an up VM through powering_down to down', async () => {
    await call('/vms/vm-01/shutdown')
    expect(await call('/vms/vm-01')).toMatchObject({ status: 'powering_down' })

    await vi.advanceTimersByTimeAsync(4_000)
    expect(await call('/vms/vm-01')).toMatchObject({ status: 'down' })
  })

  it('reboot moves an up VM through reboot_in_progress back to up', async () => {
    await call('/vms/vm-02/reboot')
    expect(await call('/vms/vm-02')).toMatchObject({ status: 'reboot_in_progress' })

    await vi.advanceTimersByTimeAsync(4_000)
    expect(await call('/vms/vm-02')).toMatchObject({ status: 'up' })
  })

  it('suspend parks an up VM as suspended immediately', async () => {
    await call('/vms/vm-03/suspend')
    expect(await call('/vms/vm-03')).toMatchObject({ status: 'suspended' })
  })

  it.each([
    // action, vm already in a state that forbids it
    ['start', 'vm-01'], // up
    ['shutdown', 'vm-08'], // down
    ['stop', 'vm-08'], // down
    ['reboot', 'vm-08'], // down
    ['suspend', 'vm-07'], // suspended
  ])('rejects %s on %s with a 409 and leaves the status untouched', async (action, id) => {
    const before = (await call(`/vms/${id}`)) as { status: string }

    const error = await call(`/vms/${id}/${action}`)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).message).toContain(action)

    expect(await call(`/vms/${id}`)).toMatchObject({ status: before.status })
  })

  it('404s action requests for unknown VM ids', async () => {
    const error = await call('/vms/no-such-vm/start')
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })
})

describe('listOperatingSystems', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('dedupes per-architecture repeats by name and sorts by display label', async () => {
    // The generic entries arrive once per architecture with the SAME name;
    // the 32/64-bit split is a distinct name and must be kept.
    mockFetch(200, {
      operating_system: [
        { name: 'windows_2022', description: 'Windows Server 2022' },
        { name: 'other', description: 'Other OS' },
        { name: 'other', description: 'Other OS' }, // ppc64 repeat
        { name: 'other', description: 'Other OS' }, // s390x repeat
        { name: 'rhel_8x', description: 'Red Hat Enterprise Linux 8.x' },
        { name: 'rhel_8x64', description: 'Red Hat Enterprise Linux 8.x x64' },
      ],
    })

    const list = await listOperatingSystems()
    expect(list.map((os) => os.name)).toEqual([
      'other', // "Other OS" — the three repeats collapsed to one
      'rhel_8x', // "Red Hat Enterprise Linux 8.x"
      'rhel_8x64', // "…8.x x64" (32/64-bit split kept — distinct name)
      'windows_2022', // "Windows Server 2022"
    ])
  })

  it('tolerates a 404 (OS catalog unavailable) as an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listOperatingSystems()).resolves.toEqual([])
  })
})
