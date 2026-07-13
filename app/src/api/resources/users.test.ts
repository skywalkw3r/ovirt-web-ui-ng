import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addUserEventSubscription,
  getUser,
  listGroups,
  listUserEventSubscriptions,
  listUserGroups,
  listUserPermissions,
  listUserQuotas,
  removeGroup,
  removeUserEventSubscription,
} from './users'
import { QUOTA_CONSUMER_ROLE_ID } from './roles'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/vms.test.ts. Resources are
// unit-tested against a stubbed global fetch so they never touch the mock
// engine (owned elsewhere): assert the URL/method the resource emits and the
// parsed result it returns.
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

describe('getUser', () => {
  it('GETs /users/{id} and parses the identity facts', async () => {
    const fetchMock = mockFetch(200, {
      id: 'user-01',
      user_name: 'jdoe@internal',
      name: 'Jane',
      last_name: 'Doe',
      email: 'jane@corp.example',
      department: 'Platform',
      namespace: '*',
      domain: { id: 'internal-authz', name: 'internal' },
    })

    const user = await getUser('user-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/users/user-01')
    expect(user.user_name).toBe('jdoe@internal')
    expect(user.department).toBe('Platform')
    expect(user.domain?.name).toBe('internal')
  })

  it('encodes the id and surfaces a fault envelope as ApiError', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'No such user' } })
    const error = await getUser('bad id').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'No such user' })
  })
})

describe('removeGroup', () => {
  it('DELETEs /groups/{id} and resolves void', async () => {
    const fetchMock = mockFetch(204)
    await expect(removeGroup('group-07')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/groups/group-07')
    expect(init.method).toBe('DELETE')
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Group still grants access' } })
    const error = await removeGroup('group-07').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Group still grants access' })
  })
})

describe('listGroups', () => {
  it('emits the search term as an encoded ?search= param', async () => {
    const fetchMock = mockFetch(200, { group: [{ id: 'group-01', name: 'dev-team' }] })
    const groups = await listGroups({ search: 'name=dev*' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/groups?search=name%3Ddev*')
    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('dev-team')
  })

  it('omits the query string when unsearched and tolerates the empty-list quirk', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(listGroups()).resolves.toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/groups')
  })
})

describe('listUserGroups', () => {
  it("GETs /users/{id}/groups and returns the user's directory groups", async () => {
    const fetchMock = mockFetch(200, {
      group: [
        { id: 'group-01', name: 'dev-team', namespace: 'dc=corp', domain: { name: 'ldap.corp' } },
      ],
    })
    const groups = await listUserGroups('user-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/users/user-01/groups')
    expect(groups[0]?.name).toBe('dev-team')
  })

  it('degrades a 404 subcollection to an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listUserGroups('user-01')).resolves.toEqual([])
  })

  it('rethrows non-404 faults', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })
    await expect(listUserGroups('user-01')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('listUserPermissions', () => {
  it('GETs the permissions subcollection following role,user,group', async () => {
    const fetchMock = mockFetch(200, {
      permission: [{ id: 'perm-01', role: { id: 'role-01', name: 'UserRole' } }],
    })
    const permissions = await listUserPermissions('user-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/users/user-01/permissions?follow=role',
    )
    expect(permissions[0]?.role?.name).toBe('UserRole')
  })

  it('degrades a 404 subcollection to an empty list', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listUserPermissions('user-01')).resolves.toEqual([])
  })
})

// URL-dispatching fetch stub for the composed reads (listUserQuotas fans out
// over /datacenters, per-DC quotas, the user's groups, and per-quota
// permissions). Unrouted paths 404 with a fault envelope, which the composed
// fns treat as empty/optional per the REST hygiene conventions.
function mockFetchByPath(routes: Record<string, unknown>) {
  const fn = vi.fn().mockImplementation((url: string) => {
    const path = url.replace('/ovirt-engine/api', '').split('?')[0] ?? ''
    const payload = routes[path]
    if (payload === undefined) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ fault: { reason: 'Not Found' } }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('listUserQuotas', () => {
  it('keeps quotas whose permissions carry a QuotaConsumer grant for the user, a group, or Everyone', async () => {
    mockFetchByPath({
      '/datacenters': { data_center: [{ id: 'dc-01', name: 'Default' }] },
      '/datacenters/dc-01/quotas': {
        quota: [
          { id: 'quota-01', name: 'default', data_center: { id: 'dc-01' } },
          { id: 'quota-02', name: 'dev-quota', data_center: { id: 'dc-01' } },
          { id: 'quota-03', name: 'shared', data_center: { id: 'dc-01' } },
          { id: 'quota-04', name: 'unrelated', data_center: { id: 'dc-01' } },
        ],
      },
      '/users/user-04/groups': { group: [{ id: 'group-01', name: 'dev-team' }] },
      '/quotas/quota-01/permissions': {
        permission: [
          {
            id: 'p1',
            role: { id: QUOTA_CONSUMER_ROLE_ID, name: 'QuotaConsumer', administrative: 'false' },
            user: { id: 'user-04' },
          },
        ],
      },
      '/quotas/quota-02/permissions': {
        permission: [
          {
            id: 'p2',
            role: { id: QUOTA_CONSUMER_ROLE_ID },
            group: { id: 'group-01', name: 'dev-team' },
          },
        ],
      },
      '/quotas/quota-03/permissions': {
        permission: [
          {
            id: 'p3',
            role: { id: QUOTA_CONSUMER_ROLE_ID },
            group: { id: 'eee00000-0000-0000-0000-123456789eee', name: 'Everyone' },
          },
        ],
      },
      // quota-04 carries a grant for someone else + a non-consumer role for
      // this user — neither counts
      '/quotas/quota-04/permissions': {
        permission: [
          { id: 'p4', role: { id: QUOTA_CONSUMER_ROLE_ID }, user: { id: 'user-99' } },
          { id: 'p5', role: { id: 'role-superuser' }, user: { id: 'user-04' } },
        ],
      },
    })

    const grants = await listUserQuotas('user-04')
    expect(grants.map((g) => [g.quota.id, g.via.kind])).toEqual([
      ['quota-01', 'user'],
      ['quota-02', 'group'],
      ['quota-03', 'everyone'],
    ])
    const viaGroup = grants[1]?.via
    expect(viaGroup?.kind === 'group' && viaGroup.name).toBe('dev-team')
  })

  it('treats a 404 on a quota permissions subcollection as no grant there', async () => {
    mockFetchByPath({
      '/datacenters': { data_center: [{ id: 'dc-01', name: 'Default' }] },
      '/datacenters/dc-01/quotas': { quota: [{ id: 'quota-01', name: 'default' }] },
      // /users/.../groups and /quotas/quota-01/permissions both 404 → empty
    })
    await expect(listUserQuotas('user-04')).resolves.toEqual([])
  })
})

describe('listUserEventSubscriptions', () => {
  it('GETs /users/{id}/eventsubscriptions and parses the collection', async () => {
    const fetchMock = mockFetch(200, {
      event_subscription: [
        {
          id: 'host_high_cpu_use',
          event: 'host_high_cpu_use',
          notification_method: 'smtp',
          address: 'jane.doe@corp.example',
          user: { id: 'user-04' },
        },
        { id: 'vm_paused_eio', event: 'vm_paused_eio', notification_method: 'smtp' },
      ],
    })
    const subscriptions = await listUserEventSubscriptions('user-04')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/users/user-04/eventsubscriptions')
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0]?.event).toBe('host_high_cpu_use')
    expect(subscriptions[0]?.address).toBe('jane.doe@corp.example')
  })

  it('degrades a 404 subcollection to an empty list and tolerates the omitted-key quirk', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listUserEventSubscriptions('user-04')).resolves.toEqual([])
    mockFetch(200, {})
    await expect(listUserEventSubscriptions('user-04')).resolves.toEqual([])
  })
})

describe('addUserEventSubscription', () => {
  it('POSTs the event, omitting address when not provided', async () => {
    const fetchMock = mockFetch(200, {
      id: 'vm_paused',
      event: 'vm_paused',
      notification_method: 'smtp',
    })
    const created = await addUserEventSubscription('user-04', { event: 'vm_paused' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users/user-04/eventsubscriptions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ event: 'vm_paused' })
    expect(created.event).toBe('vm_paused')
  })

  it('forwards a non-empty address and surfaces the 409 conflict fault', async () => {
    const fetchMock = mockFetch(200, { id: 'vm_paused', event: 'vm_paused' })
    await addUserEventSubscription('user-04', { event: 'vm_paused', address: 'a@b.com' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ event: 'vm_paused', address: 'a@b.com' })

    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Address conflicts with existing subscription' },
    })
    const error = await addUserEventSubscription('user-04', {
      event: 'vm_paused',
      address: 'other@b.com',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409 })
  })
})

describe('removeUserEventSubscription', () => {
  it('DELETEs the event-named subscription id', async () => {
    const fetchMock = mockFetch(204)
    await expect(removeUserEventSubscription('user-04', 'host_high_cpu_use')).resolves.toBe(
      undefined,
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users/user-04/eventsubscriptions/host_high_cpu_use')
    expect(init.method).toBe('DELETE')
  })
})
