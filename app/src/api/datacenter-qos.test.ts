import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDataCenterQos,
  deleteDataCenterQos,
  listDataCenterQoss,
  updateDataCenterQos,
} from './resources/datacenters'
import { resetMockVms } from './mock/handlers'
import { clearSessionToken, setSessionToken } from './session'

// The QoS data layer end to end through the mock: the create/edit/delete
// resource fns land in mockRequest (import.meta.env.DEV stays true and
// VITE_MOCK is stubbed), zod parsing included, exercising the per-type schema
// coercion, the in-use delete 409, and the 404-tolerant list. Mirrors
// vnic-profiles.test.ts.
describe('data center QoS CRUD (mock)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setSessionToken('tok-123')
    vi.stubEnv('VITE_MOCK', '1')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetMockVms()
    clearSessionToken()
    vi.useRealTimers()
  })

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  // Rejection helper: attach the expectation BEFORE advancing the timers so the
  // rejection never floats unhandled.
  async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
    const assertion = expect(promise).rejects.toMatchObject(expected)
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  }

  it('lists every fixture type with the per-type scalars coerced to numbers', async () => {
    const qoss = await settle(listDataCenterQoss('dc-01'))
    const byId = new Map(qoss.map((qos) => [qos.id, qos]))

    // storage — string throughput coerces (fixture ships '200')
    expect(byId.get('qos-storage-01')?.max_throughput).toBe(200)
    expect(byId.get('qos-storage-01')?.max_iops).toBe(5000)
    // storage split — mixed string/number read/write pairs
    expect(byId.get('qos-storage-02')?.max_read_throughput).toBe(150)
    expect(byId.get('qos-storage-02')?.max_write_throughput).toBe(120)
    expect(byId.get('qos-storage-02')?.max_read_iops).toBe(4000)
    // network — string rates coerce (fixture ships '512'/'1024'/'64')
    expect(byId.get('qos-network-01')?.inbound_average).toBe(512)
    expect(byId.get('qos-network-01')?.inbound_peak).toBe(1024)
    expect(byId.get('qos-network-01')?.outbound_burst).toBe(64)
    // cpu — string percentage coerces
    expect(byId.get('qos-cpu-01')?.cpu_limit).toBe(50)
    // hostnetwork — mixed string/number shares
    expect(byId.get('qos-hostnet-01')?.outbound_average_linkshare).toBe(10)
    expect(byId.get('qos-hostnet-01')?.outbound_average_upperlimit).toBe(100)
    expect(byId.get('qos-hostnet-01')?.outbound_average_realtime).toBe(5)
  })

  it('maps a data center without any QoS to an empty list (404-tolerant)', async () => {
    // dc-02 does not exist in the fixture map → the mock 404s the subcollection
    await expect(settle(listDataCenterQoss('dc-02'))).resolves.toEqual([])
  })

  it('creates a network QoS and the list picks it up with fields echoed', async () => {
    const created = await settle(
      createDataCenterQos('dc-01', {
        name: 'silver-net',
        type: 'network',
        inbound_average: 128,
        outbound_average: 128,
      }),
    )
    expect(created.name).toBe('silver-net')
    expect(created.type).toBe('network')
    expect(created.inbound_average).toBe(128)
    expect(created.outbound_average).toBe(128)

    const after = await settle(listDataCenterQoss('dc-01'))
    expect(after.map((qos) => qos.name)).toContain('silver-net')
  })

  it('creates a storage QoS carrying only the total axis fields', async () => {
    const created = await settle(
      createDataCenterQos('dc-01', {
        name: 'silver-storage',
        type: 'storage',
        max_throughput: 100,
        max_iops: 1000,
      }),
    )
    expect(created.max_throughput).toBe(100)
    expect(created.max_iops).toBe(1000)
    expect(created.max_read_throughput).toBeUndefined()
    expect(created.max_read_iops).toBeUndefined()
  })

  it('creates cpu and hostnetwork QoS profiles', async () => {
    const cpu = await settle(
      createDataCenterQos('dc-01', { name: 'quarter-core', type: 'cpu', cpu_limit: 25 }),
    )
    expect(cpu.cpu_limit).toBe(25)

    const hostnet = await settle(
      createDataCenterQos('dc-01', {
        name: 'backup-share',
        type: 'hostnetwork',
        outbound_average_linkshare: 20,
        outbound_average_upperlimit: 50,
      }),
    )
    expect(hostnet.outbound_average_linkshare).toBe(20)
    expect(hostnet.outbound_average_upperlimit).toBe(50)
  })

  it('rejects a create missing the required name (400)', async () => {
    await settleRejection(createDataCenterQos('dc-01', { type: 'network' }), {
      status: 400,
      message: expect.stringContaining('name'),
    })
  })

  it('rejects a duplicate QoS name within the data center (409)', async () => {
    await settleRejection(createDataCenterQos('dc-01', { name: 'gold-storage', type: 'storage' }), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('404s a create against an unknown data center', async () => {
    await settleRejection(createDataCenterQos('dc-nope', { name: 'x', type: 'cpu' }), {
      status: 404,
    })
  })

  it('edits the mutable fields via update and the list reflects it', async () => {
    const updated = await settle(
      updateDataCenterQos('dc-01', 'qos-cpu-01', {
        name: 'half-core-renamed',
        description: 'edited',
        cpu_limit: 60,
      }),
    )
    expect(updated.name).toBe('half-core-renamed')
    expect(updated.description).toBe('edited')
    expect(updated.cpu_limit).toBe(60)
    // the type is immutable — it stays whatever the fixture carried
    expect(updated.type).toBe('cpu')

    const after = await settle(listDataCenterQoss('dc-01'))
    expect(after.find((qos) => qos.id === 'qos-cpu-01')?.name).toBe('half-core-renamed')
  })

  it('rejects a rename onto an existing QoS name (409)', async () => {
    await settleRejection(updateDataCenterQos('dc-01', 'qos-cpu-01', { name: 'gold-storage' }), {
      status: 409,
      message: expect.stringContaining('already in use'),
    })
  })

  it('404s an update against an unknown QoS id', async () => {
    await settleRejection(updateDataCenterQos('dc-01', 'qos-nope', { name: 'x' }), { status: 404 })
  })

  it('deletes an unused QoS and the list drops it', async () => {
    await settle(deleteDataCenterQos('dc-01', 'qos-cpu-01'))
    const after = await settle(listDataCenterQoss('dc-01'))
    expect(after.map((qos) => qos.id)).not.toContain('qos-cpu-01')
  })

  it('rejects deleting a QoS referenced by a vNIC profile with 409 (in-use)', async () => {
    // vnic-03 carries qos: { id: 'qos-network-01' }
    await settleRejection(deleteDataCenterQos('dc-01', 'qos-network-01'), {
      status: 409,
      message: expect.stringContaining('used by'),
    })
    // the guard leaves the fixture in place
    const after = await settle(listDataCenterQoss('dc-01'))
    expect(after.map((qos) => qos.id)).toContain('qos-network-01')
  })

  it('404s deleting an unknown QoS', async () => {
    await settleRejection(deleteDataCenterQos('dc-01', 'qos-nope'), { status: 404 })
  })
})

// Request-shape coverage: the resource fns build the right method/URL/body,
// independent of the mock. Mirrors vnic-profiles.test.ts' stubbed-fetch style.
describe('data center QoS request shapes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

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

  it('createDataCenterQos POSTs the body to the DC qoss subcollection', async () => {
    const fetchMock = mockFetch(201, { id: 'qos-new-1', name: 'silver-net', type: 'network' })
    await createDataCenterQos('dc-01', { name: 'silver-net', type: 'network', cpu_limit: 5 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/qoss')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'silver-net',
      type: 'network',
      cpu_limit: 5,
    })
  })

  it('updateDataCenterQos PUTs to the QoS url', async () => {
    const fetchMock = mockFetch(200, { id: 'qos-1', name: 'renamed', type: 'cpu' })
    await updateDataCenterQos('dc-01', 'qos-1', { name: 'renamed', cpu_limit: 10 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/qoss/qos-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'renamed', cpu_limit: 10 })
  })

  it('deleteDataCenterQos DELETEs the QoS url with no body', async () => {
    const fetchMock = mockFetch(200, {})
    await deleteDataCenterQos('dc-01', 'qos-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/qoss/qos-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('URL-encodes both path segments', async () => {
    const fetchMock = mockFetch(200, {})
    await deleteDataCenterQos('dc/1', 'qos 1')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc%2F1/qoss/qos%201')
  })
})
