import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addGlusterBricks,
  buildCreateVolumePayload,
  createGlusterVolume,
  deleteGlusterVolume,
  isReplicatedType,
  listGlusterBricks,
  listGlusterVolumeOptions,
  migrateGlusterBricks,
  rebalanceGlusterVolume,
  removeGlusterBricks,
  resetAllGlusterVolumeOptions,
  resetGlusterVolumeOption,
  setGlusterVolumeOption,
  startGlusterVolume,
  startGlusterVolumeProfile,
  stopGlusterVolume,
  stopGlusterVolumeProfile,
  stopMigrateGlusterBricks,
  type CreateVolumeDraft,
} from './volumes'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — same shape as api/resources/users.test.ts.
// Resources are unit-tested against a stubbed global fetch so they never touch
// the mock engine: assert the URL/method/body the resource emits and the parsed
// result it returns.
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

const baseDraft = (): CreateVolumeDraft => ({
  name: '  gv-new  ',
  volumeType: 'replicate',
  replicaCount: 3,
  transportTcp: true,
  transportRdma: false,
  bricks: [
    { serverId: 'host-01', brickDir: ' /export/brick1 ' },
    { serverId: 'host-02', brickDir: '/export/brick2' },
  ],
})

describe('buildCreateVolumePayload', () => {
  it('shapes name/type/bricks/transport and rides replica_count for replicated types', () => {
    const body = buildCreateVolumePayload(baseDraft())
    expect(body).toEqual({
      name: 'gv-new',
      volume_type: 'replicate',
      replica_count: 3,
      bricks: {
        brick: [
          { server_id: 'host-01', brick_dir: '/export/brick1' },
          { server_id: 'host-02', brick_dir: '/export/brick2' },
        ],
      },
      transport_types: { transport_type: ['tcp'] },
    })
  })

  it('omits replica_count on a plain distribute volume', () => {
    const body = buildCreateVolumePayload({ ...baseDraft(), volumeType: 'distribute' })
    expect(body).not.toHaveProperty('replica_count')
    expect(body.volume_type).toBe('distribute')
  })

  it('includes both transports when TCP and RDMA are selected and omits the wrapper when neither is', () => {
    const both = buildCreateVolumePayload({
      ...baseDraft(),
      transportTcp: true,
      transportRdma: true,
    })
    expect(both.transport_types).toEqual({ transport_type: ['tcp', 'rdma'] })

    const none = buildCreateVolumePayload({
      ...baseDraft(),
      transportTcp: false,
      transportRdma: false,
    })
    expect(none).not.toHaveProperty('transport_types')
  })
})

describe('isReplicatedType', () => {
  it('is true only for the replicated types', () => {
    expect(isReplicatedType('replicate')).toBe(true)
    expect(isReplicatedType('distributed_replicate')).toBe(true)
    expect(isReplicatedType('distribute')).toBe(false)
  })
})

describe('createGlusterVolume', () => {
  it('POSTs to the cluster subcollection and parses the created volume', async () => {
    const fetchMock = mockFetch(201, {
      id: 'gvol-99',
      name: 'gv-new',
      volume_type: 'replicate',
      status: 'up',
      // string count exercises the schema's z.coerce.number()
      replica_count: '3',
    })
    const body = buildCreateVolumePayload(baseDraft())
    const volume = await createGlusterVolume('cluster-02', body)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
    expect(volume.name).toBe('gv-new')
    expect(volume.replica_count).toBe(3)
  })

  it('surfaces a duplicate-name fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Volume name already exists' } })
    const error = await createGlusterVolume('cluster-02', { name: 'gv-data' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Volume name already exists' })
  })
})

describe('listGlusterBricks', () => {
  it('GETs the bricks subcollection and returns the parsed list', async () => {
    const fetchMock = mockFetch(200, {
      brick: [
        { id: 'brick-01', name: 'node-01:/export/brick1', server_id: 'host-01', status: 'up' },
      ],
    })
    const bricks = await listGlusterBricks('cluster-02', 'gvol-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/glusterbricks',
    )
    expect(bricks).toHaveLength(1)
    expect(bricks[0]?.server_id).toBe('host-01')
  })

  it('degrades a 404 subcollection to an empty list and tolerates the empty-list quirk', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listGlusterBricks('cluster-02', 'gvol-01')).resolves.toEqual([])
  })

  it('rethrows non-404 faults', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })
    await expect(listGlusterBricks('cluster-02', 'gvol-01')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('addGlusterBricks', () => {
  it('POSTs the brick collection with server_id/brick_dir and no query when no counts given', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(
      addGlusterBricks('cluster-02', 'gvol-01', [
        { serverId: 'host-03', brickDir: ' /export/b3 ' },
      ]),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/glusterbricks')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      brick: [{ server_id: 'host-03', brick_dir: '/export/b3' }],
    })
  })

  it('rides replica_count / stripe_count as query params', async () => {
    const fetchMock = mockFetch(200, {})
    await addGlusterBricks(
      'cluster-02',
      'gvol-01',
      [{ serverId: 'host-03', brickDir: '/export/b3' }],
      {
        replicaCount: 3,
        stripeCount: 2,
      },
    )
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/glusterbricks?replica_count=3&stripe_count=2',
    )
  })
})

describe('startGlusterVolume', () => {
  it('POSTs the start action with an empty body by default', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(startGlusterVolume('cluster-02', 'gvol-01')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/start')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('sends force:true when forced', async () => {
    const fetchMock = mockFetch(200, {})
    await startGlusterVolume('cluster-02', 'gvol-01', { force: true })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ force: true })
  })
})

describe('stopGlusterVolume', () => {
  it('POSTs the stop action and carries force when set', async () => {
    const fetchMock = mockFetch(200, {})
    await stopGlusterVolume('cluster-02', 'gvol-01', { force: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/stop')
    expect(JSON.parse(init.body as string)).toEqual({ force: true })
  })
})

describe('rebalanceGlusterVolume', () => {
  it('POSTs the rebalance action with fix_layout / force flags', async () => {
    const fetchMock = mockFetch(200, {})
    await rebalanceGlusterVolume('cluster-02', 'gvol-01', { fixLayout: true, force: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/rebalance')
    expect(JSON.parse(init.body as string)).toEqual({ fix_layout: true, force: true })
  })

  it('sends an empty body when no options are set', async () => {
    const fetchMock = mockFetch(200, {})
    await rebalanceGlusterVolume('cluster-02', 'gvol-01')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({})
  })
})

describe('removeGlusterBricks', () => {
  it('DELETEs the glusterbricks collection with the brick refs in the body (id preferred)', async () => {
    const fetchMock = mockFetch(204)
    await expect(
      removeGlusterBricks('cluster-02', 'gvol-01', [
        { id: 'brick-01', name: 'node-01:/export/b1' },
        { name: 'node-02:/export/b2' },
      ]),
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/glusterbricks')
    expect(init.method).toBe('DELETE')
    // id wins when present; the id-less brick falls back to its server:dir name
    expect(JSON.parse(init.body as string)).toEqual({
      bricks: { brick: [{ id: 'brick-01' }, { name: 'node-02:/export/b2' }] },
    })
  })

  it('rides a reduced replica_count as a query param', async () => {
    const fetchMock = mockFetch(204)
    await removeGlusterBricks('cluster-02', 'gvol-01', [{ id: 'brick-01' }], { replicaCount: 2 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/glusterbricks?replica_count=2',
    )
  })
})

describe('migrateGlusterBricks', () => {
  it('POSTs the migrate action with the brick refs', async () => {
    const fetchMock = mockFetch(200, {})
    await migrateGlusterBricks('cluster-02', 'gvol-01', [{ id: 'brick-01' }])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      '/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/glusterbricks/migrate',
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ bricks: { brick: [{ id: 'brick-01' }] } })
  })
})

describe('stopMigrateGlusterBricks', () => {
  it('POSTs the stopmigrate action with the brick refs', async () => {
    const fetchMock = mockFetch(200, {})
    await stopMigrateGlusterBricks('cluster-02', 'gvol-01', [{ id: 'brick-01' }])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      '/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/glusterbricks/stopmigrate',
    )
    expect(JSON.parse(init.body as string)).toEqual({ bricks: { brick: [{ id: 'brick-01' }] } })
  })
})

describe('listGlusterVolumeOptions', () => {
  it('GETs the volume and returns its inlined options', async () => {
    const fetchMock = mockFetch(200, {
      id: 'gvol-01',
      name: 'gv-data',
      options: {
        option: [
          { name: 'auth.allow', value: '*' },
          { name: 'performance.cache-size', value: '256MB' },
        ],
      },
    })
    const opts = await listGlusterVolumeOptions('cluster-02', 'gvol-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01',
    )
    expect(opts.map((o) => o.name)).toEqual(['auth.allow', 'performance.cache-size'])
  })

  it('treats an omitted option list as no options (engine JSON quirk)', async () => {
    mockFetch(200, { id: 'gvol-01', name: 'gv-data' })
    await expect(listGlusterVolumeOptions('cluster-02', 'gvol-01')).resolves.toEqual([])
  })
})

describe('setGlusterVolumeOption', () => {
  it('POSTs setoption with a trimmed { option: { name, value } }', async () => {
    const fetchMock = mockFetch(200, {})
    await setGlusterVolumeOption('cluster-02', 'gvol-01', '  auth.allow  ', '  10.0.0.* ')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/setoption')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      option: { name: 'auth.allow', value: '10.0.0.*' },
    })
  })
})

describe('resetGlusterVolumeOption', () => {
  it('POSTs resetoption with { option: { name } } and no force by default', async () => {
    const fetchMock = mockFetch(200, {})
    await resetGlusterVolumeOption('cluster-02', 'gvol-01', 'auth.allow')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/resetoption')
    expect(JSON.parse(init.body as string)).toEqual({ option: { name: 'auth.allow' } })
  })

  it('rides force:true in the body when forced', async () => {
    const fetchMock = mockFetch(200, {})
    await resetGlusterVolumeOption('cluster-02', 'gvol-01', 'auth.allow', { force: true })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      option: { name: 'auth.allow' },
      force: true,
    })
  })
})

describe('resetAllGlusterVolumeOptions', () => {
  it('POSTs resetalloptions with an empty action body', async () => {
    const fetchMock = mockFetch(200, {})
    await resetAllGlusterVolumeOptions('cluster-02', 'gvol-01')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/resetalloptions')
    expect(JSON.parse(init.body as string)).toEqual({})
  })
})

describe('volume profiling', () => {
  it('startGlusterVolumeProfile POSTs startprofile with an empty body', async () => {
    const fetchMock = mockFetch(200, {})
    await startGlusterVolumeProfile('cluster-02', 'gvol-01')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/startprofile')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('stopGlusterVolumeProfile POSTs stopprofile with an empty body', async () => {
    const fetchMock = mockFetch(200, {})
    await stopGlusterVolumeProfile('cluster-02', 'gvol-01')
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01/stopprofile')
  })
})

describe('deleteGlusterVolume', () => {
  it('DELETEs the volume and resolves void', async () => {
    const fetchMock = mockFetch(204)
    await expect(deleteGlusterVolume('cluster-02', 'gvol-01')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/clusters/cluster-02/glustervolumes/gvol-01')
    expect(init.method).toBe('DELETE')
  })

  it('surfaces an in-use fault verbatim as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Volume must be stopped first' },
    })
    const error = await deleteGlusterVolume('cluster-02', 'gvol-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Volume must be stopped first' })
  })
})
