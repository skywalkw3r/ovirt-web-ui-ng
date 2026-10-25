import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clusters, dataCenters, hosts, mockRequest, resetMockVms } from '../handlers'
import { clearSessionToken, setSessionToken } from '../../session'

// The mock engine pieces Configure Local Storage and the local-DC storage form
// lean on: local data centers on the flat list, the cluster's DC link, the
// maintenance-gated cluster move, the Uninitialized -> Up pool flip, plus the
// pass_discard echo on POST /vms/{id}/diskattachments.
beforeEach(() => {
  vi.useFakeTimers()
  setSessionToken('tok-123')
})
afterEach(() => {
  resetMockVms()
  clearSessionToken()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(500)
  return promise
}

async function settleRejection(promise: Promise<unknown>, expected: Record<string, unknown>) {
  const assertion = expect(promise).rejects.toMatchObject(expected)
  await vi.advanceTimersByTimeAsync(500)
  await assertion
}

type Json = Record<string, unknown>

async function createLocalSetup() {
  const dc = (await settle(
    mockRequest('/datacenters', {
      method: 'POST',
      body: { name: 'node-03-Local', local: true, version: { major: 4, minor: 7 } },
    }),
  )) as { id: string }
  const cluster = (await settle(
    mockRequest('/clusters', {
      method: 'POST',
      body: { name: 'node-03-Local', data_center: { id: dc.id } },
    }),
  )) as { id: string }
  return { dcId: dc.id, clusterId: cluster.id }
}

describe('POST /datacenters', () => {
  it('copies local onto the flat list and starts Uninitialized', async () => {
    const { dcId } = await createLocalSetup()
    const list = (await settle(mockRequest('/datacenters'))) as { data_center: Json[] }
    expect(list.data_center.find((dc) => dc.id === dcId)).toMatchObject({
      name: 'node-03-Local',
      local: true,
      status: 'uninitialized',
    })
  })
})

describe('POST /clusters', () => {
  it('links the new cluster to its data center on the flat list', async () => {
    const { dcId, clusterId } = await createLocalSetup()
    expect(clusters.find((c) => c.id === clusterId)?.data_center).toEqual({ id: dcId })
  })
})

describe('PUT /hosts/{id} with a cluster change', () => {
  it('refuses a host that is not in maintenance', async () => {
    const { clusterId } = await createLocalSetup()
    await settleRejection(
      mockRequest('/hosts/host-01', { method: 'PUT', body: { cluster: { id: clusterId } } }),
      { status: 409, message: expect.stringMatching(/must be in maintenance/) },
    )
  })

  it('moves a maintenance host and allows one host per local data center', async () => {
    const { clusterId } = await createLocalSetup()
    await settle(
      mockRequest('/hosts/host-03', { method: 'PUT', body: { cluster: { id: clusterId } } }),
    )
    expect(hosts.find((h) => h.id === 'host-03')?.cluster).toEqual({
      id: clusterId,
      name: 'node-03-Local',
    })
    const other = hosts.find((h) => h.id === 'host-02')
    if (other) other.status = 'maintenance'
    await settleRejection(
      mockRequest('/hosts/host-02', { method: 'PUT', body: { cluster: { id: clusterId } } }),
      { status: 409, message: expect.stringMatching(/more than one host to a local storage/) },
    )
  })

  it('leaves an unchanged cluster link alone for any status', async () => {
    await settle(
      mockRequest('/hosts/host-01', {
        method: 'PUT',
        body: { comment: 'x', cluster: { id: 'cluster-01' } },
      }),
    )
    expect(hosts.find((h) => h.id === 'host-01')).toMatchObject({ comment: 'x', status: 'up' })
  })
})

describe('POST /storagedomains (localfs) on a new local data center', () => {
  it('attaches the domain and turns the pool Up', async () => {
    const { dcId, clusterId } = await createLocalSetup()
    await settle(
      mockRequest('/hosts/host-03', { method: 'PUT', body: { cluster: { id: clusterId } } }),
    )
    await settle(mockRequest('/hosts/host-03/activate', { method: 'POST', body: {} }))
    const domain = (await settle(
      mockRequest('/storagedomains', {
        method: 'POST',
        body: {
          name: 'node-03-Local',
          type: 'data',
          host: { id: 'host-03' },
          storage: { type: 'localfs', path: '/data/images' },
        },
      }),
    )) as Json
    expect(domain).toMatchObject({ status: 'active' })
    expect(dataCenters.find((dc) => dc.id === dcId)?.status).toBe('up')
    expect(await settle(mockRequest(`/datacenters/${dcId}`))).toMatchObject({ status: 'up' })
  })
})

describe('reset', () => {
  it('drops data centers and clusters a test created', async () => {
    await createLocalSetup()
    resetMockVms()
    expect(dataCenters.map((dc) => dc.id)).toEqual(['dc-01'])
    expect(clusters.map((c) => c.id)).toEqual(['cluster-01', 'cluster-02'])
  })
})

describe('POST /vms/{id}/diskattachments: pass_discard', () => {
  it('stores the flag and echoes it on the add and the list read', async () => {
    const created = (await settle(
      mockRequest('/vms/vm-01/diskattachments', {
        method: 'POST',
        body: {
          interface: 'virtio_scsi',
          pass_discard: true,
          disk: {
            alias: 'discard-disk',
            provisioned_size: 1073741824,
            storage_domains: { storage_domain: [{ id: 'sd-01' }] },
          },
        },
      }),
    )) as Json
    expect(created.pass_discard).toBe(true)
    const list = (await settle(mockRequest('/vms/vm-01/diskattachments'))) as {
      disk_attachment: Json[]
    }
    expect(list.disk_attachment.find((a) => a.id === created.id)?.pass_discard).toBe(true)
  })

  it('omits the flag when the add body does not send it', async () => {
    const created = (await settle(
      mockRequest('/vms/vm-01/diskattachments', {
        method: 'POST',
        body: {
          disk: {
            alias: 'plain-disk',
            provisioned_size: 1073741824,
            storage_domains: { storage_domain: [{ id: 'sd-01' }] },
          },
        },
      }),
    )) as Json
    expect(created).not.toHaveProperty('pass_discard')
  })
})
