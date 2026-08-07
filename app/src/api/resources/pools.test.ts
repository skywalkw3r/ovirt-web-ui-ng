import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPool,
  deletePool,
  getPool,
  listPoolPermissions,
  listPools,
  updatePool,
} from './pools'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/resources/users.test.ts.
// Resources are unit-tested against a stubbed global fetch so they never touch
// the mock engine (owned elsewhere): assert the URL/method the resource emits
// and the parsed result it returns.
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

describe('listPools', () => {
  it('GETs /vmpools bare and returns the vm_pool array, coercing string scalars', async () => {
    const fetchMock = mockFetch(200, {
      vm_pool: [
        { id: 'pool-01', name: 'dev-pool', size: '5', prestarted_vms: '2', max_user_vms: '1' },
      ],
    })
    const pools = await listPools()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vmpools')
    expect(pools).toHaveLength(1)
    expect(pools[0]?.size).toBe(5)
    expect(pools[0]?.prestarted_vms).toBe(2)
  })

  it('treats an omitted vm_pool key as an empty list', async () => {
    mockFetch(200, {})
    await expect(listPools()).resolves.toEqual([])
  })
})

describe('getPool', () => {
  it('GETs /vmpools/{id} bare and parses the read model', async () => {
    const fetchMock = mockFetch(200, {
      id: 'pool-01',
      name: 'dev-pool',
      size: '5',
      type: 'automatic',
      stateful: 'true',
      cluster: { id: 'cluster-01' },
    })
    const pool = await getPool('pool-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vmpools/pool-01')
    expect(pool.stateful).toBe(true)
    expect(pool.size).toBe(5)
    expect(pool.cluster?.id).toBe('cluster-01')
  })

  it('encodes the id and surfaces a fault envelope as ApiError', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no vm pool with id x' } })
    const error = await getPool('bad id').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'no vm pool with id x' })
  })
})

describe('createPool', () => {
  it('POSTs /vmpools with the body and parses the created pool', async () => {
    const fetchMock = mockFetch(201, {
      id: 'pool-new-2',
      name: 'qa-pool',
      size: 4,
      type: 'manual',
    })
    const pool = await createPool({ name: 'qa-pool', cluster: { id: 'cluster-01' } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vmpools')
    expect(init.method).toBe('POST')
    expect(pool.name).toBe('qa-pool')
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'name already in use' } })
    const error = await createPool({ name: 'dup' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'name already in use' })
  })
})

describe('updatePool', () => {
  it('PUTs /vmpools/{id} with the changed fields and parses the merged pool', async () => {
    const fetchMock = mockFetch(200, { id: 'pool-01', name: 'dev-pool', size: 8 })
    const pool = await updatePool('pool-01', { size: 8 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vmpools/pool-01')
    expect(init.method).toBe('PUT')
    expect(pool.size).toBe(8)
  })
})

describe('deletePool', () => {
  it('DELETEs /vmpools/{id} and resolves void', async () => {
    const fetchMock = mockFetch(204)
    await expect(deletePool('pool-01')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vmpools/pool-01')
    expect(init.method).toBe('DELETE')
  })

  it('surfaces the running-VMs 409 verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'still has running VMs' } })
    const error = await deletePool('pool-02').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'still has running VMs' })
  })
})

describe('listPoolPermissions', () => {
  it('GETs the followed permissions subcollection and returns the grants', async () => {
    const fetchMock = mockFetch(200, {
      permission: [{ id: 'perm-1', role: { id: 'role-1', name: 'UserRole' }, user: { id: 'u-1' } }],
    })
    const permissions = await listPoolPermissions('pool-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/vmpools/pool-01/permissions?follow=role',
    )
    expect(permissions).toHaveLength(1)
    expect(permissions[0]?.role?.name).toBe('UserRole')
  })

  it('tolerates the 404 an engine with no assigned grants returns as an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no permissions' } })
    await expect(listPoolPermissions('pool-01')).resolves.toEqual([])
  })

  it('rethrows a non-404 fault', async () => {
    mockFetch(500, { fault: { reason: 'Server Error', detail: 'boom' } })
    const error = await listPoolPermissions('pool-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })
})
