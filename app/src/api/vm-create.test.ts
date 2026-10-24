import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVm, deleteVm, type NewVmSpec } from './resources/vms'
import { listClusters } from './resources/clusters'
import { listTemplates } from './resources/templates'
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

describe('listTemplates', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /templates and tolerates unmodeled fields', async () => {
    const fetchMock = mockFetch(200, {
      template: [
        { id: 'tpl-1', name: 'Blank', version: {} },
        {
          id: 'tpl-2',
          name: 'centos-stream-9',
          description: 'CentOS Stream 9',
          os: { type: 'other_linux', boot: {} },
        },
      ],
    })

    const templates = await listTemplates()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/templates')
    expect(templates).toHaveLength(2)
    expect(templates[1].os?.type).toBe('other_linux')
  })

  it('handles the empty-list quirk (missing "template" key)', async () => {
    mockFetch(200, {})
    await expect(listTemplates()).resolves.toEqual([])
  })
})

describe('listClusters', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /clusters and tolerates unmodeled fields', async () => {
    const fetchMock = mockFetch(200, {
      cluster: [
        { id: 'cl-1', name: 'Default', description: 'The default server cluster', cpu: {} },
        { id: 'cl-2', name: 'lab-nested' },
      ],
    })

    const clusters = await listClusters()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/clusters')
    expect(clusters.map((c) => c.name)).toEqual(['Default', 'lab-nested'])
  })

  it('handles the empty-list quirk (missing "cluster" key)', async () => {
    mockFetch(200, {})
    await expect(listClusters()).resolves.toEqual([])
  })
})

describe('createVm', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs template/cluster by name, memory bytes, and an initialization block', async () => {
    const fetchMock = mockFetch(201, { id: 'vm-new', name: 'ci-worker', status: 'down' })
    const spec: NewVmSpec = {
      name: 'ci-worker',
      description: 'ephemeral runner',
      templateName: 'centos-stream-9',
      clusterName: 'Default',
      memoryBytes: 2 * GiB,
      cloudInit: {
        hostName: 'ci-worker.lab.local',
        rootPassword: 's3cret',
        sshKey: 'ssh-ed25519 AAAAC3 ci@lab',
      },
    }

    const vm = await createVm(spec)
    expect(vm).toMatchObject({ id: 'vm-new', name: 'ci-worker' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'ci-worker',
      description: 'ephemeral runner',
      template: { name: 'centos-stream-9' },
      cluster: { name: 'Default' },
      memory: 2 * GiB,
      initialization: {
        host_name: 'ci-worker.lab.local',
        root_password: 's3cret',
        authorized_ssh_keys: 'ssh-ed25519 AAAAC3 ci@lab',
      },
    })
  })

  it('omits the optional keys entirely when the spec leaves them out', async () => {
    const fetchMock = mockFetch(201, { id: 'vm-new', name: 'bare', status: 'down' })
    await createVm({ name: 'bare', templateName: 'Blank', clusterName: 'Default' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'bare',
      template: { name: 'Blank' },
      cluster: { name: 'Default' },
    })
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'VM name in use' } })

    const error = await createVm({
      name: 'dup',
      templateName: 'Blank',
      clusterName: 'Default',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'VM name in use' })
  })
})

describe('deleteVm', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('DELETEs /vms/{id} without a body and resolves void', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(deleteVm('vm-08')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-08')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('appends the detach_only matrix parameter when detachOnly is set', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await deleteVm('vm-08', { detachOnly: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-08;detach_only=true')
  })
})

describe('mock VM create/delete and catalogs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockVms()
  })
  afterEach(() => vi.useRealTimers())

  // Every mock response sits behind a short latency timer; settle it without
  // reaching the multi-second state-transition timers.
  async function call(path: string, opts: RequestOptions = {}): Promise<unknown> {
    const promise = mockRequest(path, opts).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('serves the template catalog (Blank, centos-stream-9, win2022-base)', async () => {
    const { template } = (await call('/templates', { method: 'GET' })) as {
      template: Array<{ name: string }>
    }
    expect(template.map((t) => t.name)).toEqual(['Blank', 'centos-stream-9', 'win2022-base'])
  })

  it('serves the cluster catalog (Default, lab-nested)', async () => {
    const { cluster } = (await call('/clusters', { method: 'GET' })) as {
      cluster: Array<{ name: string }>
    }
    expect(cluster.map((c) => c.name)).toEqual(['Default', 'lab-nested'])
  })

  it('creates a down VM with the requested fields and lists it afterwards', async () => {
    const created = (await call('/vms', {
      method: 'POST',
      body: {
        name: 'ci-worker',
        description: 'ephemeral runner',
        template: { name: 'centos-stream-9' },
        cluster: { name: 'Default' },
        memory: 2 * GiB,
        initialization: { host_name: 'ci-worker.lab.local' },
      },
    })) as { id: string; os?: { type?: string } }

    expect(created).toMatchObject({
      name: 'ci-worker',
      status: 'down',
      description: 'ephemeral runner',
      memory: 2 * GiB,
    })
    expect(created.os?.type).toBe('other_linux')

    const { vm } = (await call('/vms', { method: 'GET' })) as { vm: Array<{ name: string }> }
    expect(vm.some((v) => v.name === 'ci-worker')).toBe(true)
    expect(await call(`/vms/${created.id}`, { method: 'GET' })).toMatchObject({
      name: 'ci-worker',
      status: 'down',
    })
  })

  it('409s creation when the name is already in use', async () => {
    const error = await call('/vms', {
      method: 'POST',
      body: { name: 'web-01', template: { name: 'Blank' }, cluster: { name: 'Default' } },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
  })

  it('deletes a down VM and 404s subsequent reads', async () => {
    expect(await call('/vms/vm-08', { method: 'DELETE' })).toMatchObject({ status: 'complete' })

    const error = await call('/vms/vm-08', { method: 'GET' })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })

  it('matches the detach_only matrix path', async () => {
    expect(await call('/vms/vm-08;detach_only=true', { method: 'DELETE' })).toMatchObject({
      status: 'complete',
    })
    expect((await call('/vms/vm-08', { method: 'GET' })) as ApiError).toMatchObject({
      status: 404,
    })
  })

  it('409s deletion while the VM is not down (mirrors canRemove)', async () => {
    const error = await call('/vms/vm-01', { method: 'DELETE' })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)

    // still there, status untouched
    expect(await call('/vms/vm-01', { method: 'GET' })).toMatchObject({
      id: 'vm-01',
      status: 'up',
    })
  })
})
