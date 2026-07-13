import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addQuotaConsumer,
  listQuotaPermissions,
  quotaConsumers,
  removeQuotaConsumer,
} from './quotas'
import { QUOTA_CONSUMER_ROLE_ID } from './roles'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — the api/resources/*.test.ts house pattern
// (copied from tags.test.ts). Assert the URL/method/body the resource emits
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

describe('listQuotaPermissions', () => {
  it('GETs the DC-scoped permissions subcollection with follow=role only', async () => {
    const fetchMock = mockFetch(200, {
      permission: [
        {
          id: 'perm-01',
          // administrative rides as a JSON string on live engines — the
          // schema keeps both forms
          role: { id: QUOTA_CONSUMER_ROLE_ID, name: 'QuotaConsumer', administrative: 'false' },
          user: { id: 'user-02' },
        },
      ],
    })
    const result = await listQuotaPermissions('dc-01', 'quota-02')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/datacenters/dc-01/quotas/quota-02/permissions?follow=role',
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.user?.id).toBe('user-02')
  })

  it('treats a 404 (nothing assigned) as an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listQuotaPermissions('dc-01', 'quota-02')).resolves.toEqual([])
  })

  it('tolerates the omitted-key empty-list quirk', async () => {
    mockFetch(200, {})
    await expect(listQuotaPermissions('dc-01', 'quota-02')).resolves.toEqual([])
  })

  it('surfaces non-404 engine faults as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })
    const error = await listQuotaPermissions('dc-01', 'quota-02').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })
})

describe('quotaConsumers', () => {
  it('keeps only QuotaConsumer grants', () => {
    const consumers = quotaConsumers([
      { id: 'perm-01', role: { id: QUOTA_CONSUMER_ROLE_ID }, user: { id: 'user-02' } },
      { id: 'perm-02', role: { id: 'some-other-role' }, user: { id: 'user-03' } },
      { id: 'perm-03', role: { id: QUOTA_CONSUMER_ROLE_ID }, group: { id: 'group-01' } },
      { id: 'perm-04' },
    ])
    expect(consumers.map((p) => p.id)).toEqual(['perm-01', 'perm-03'])
  })
})

describe('addQuotaConsumer', () => {
  it('POSTs the QuotaConsumer role plus the user principal', async () => {
    const fetchMock = mockFetch(201, {
      id: 'perm-05',
      role: { id: QUOTA_CONSUMER_ROLE_ID },
      user: { id: 'user-04' },
    })
    const created = await addQuotaConsumer('dc-01', 'quota-02', { userId: 'user-04' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/quotas/quota-02/permissions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      role: { id: QUOTA_CONSUMER_ROLE_ID },
      user: { id: 'user-04' },
    })
    expect(created.id).toBe('perm-05')
  })

  it('POSTs a group principal when groupId is given', async () => {
    const fetchMock = mockFetch(201, {
      id: 'perm-06',
      role: { id: QUOTA_CONSUMER_ROLE_ID },
      group: { id: 'group-01' },
    })
    await addQuotaConsumer('dc-01', 'quota-02', { groupId: 'group-01' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      role: { id: QUOTA_CONSUMER_ROLE_ID },
      group: { id: 'group-01' },
    })
  })

  it('surfaces a duplicate-grant fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'already assigned' } })
    const error = await addQuotaConsumer('dc-01', 'quota-02', { userId: 'user-04' }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'already assigned' })
  })
})

describe('removeQuotaConsumer', () => {
  it('DELETEs the grant on the DC-scoped subcollection', async () => {
    const fetchMock = mockFetch(204)
    await expect(removeQuotaConsumer('dc-01', 'quota-02', 'perm-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/datacenters/dc-01/quotas/quota-02/permissions/perm-01')
    expect(init.method).toBe('DELETE')
  })
})
