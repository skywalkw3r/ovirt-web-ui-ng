import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addUser, listDirectoryUsers, listDomains, removeUser } from './resources/users'
import { ApiError } from './transport'
import { clearSessionToken, setSessionToken } from './session'

// Resource-level unit tests: stub global fetch directly (NOT mock-engine
// backed) so we assert the exact wire the transport emits and the schema
// parse of the reply. Mirrors the mockFetch helper in resources.test.ts.
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

describe('listDomains', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /domains and parses id + name', async () => {
    const fetchMock = mockFetch(200, {
      domain: [
        { id: 'internal-authz', name: 'internal' },
        { id: 'ldap.corp-authz', name: 'ldap.corp' },
      ],
    })

    const domains = await listDomains()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/domains')
    expect(domains).toHaveLength(2)
    expect(domains[0].id).toBe('internal-authz')
    expect(domains[1].name).toBe('ldap.corp')
  })

  it('handles the empty-list quirk (missing "domain" key)', async () => {
    mockFetch(200, {})
    await expect(listDomains()).resolves.toEqual([])
  })
})

describe('listDirectoryUsers', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /domains/{id}/users with an encoded search and parses identity keys', async () => {
    const fetchMock = mockFetch(200, {
      user: [
        {
          id: 'dir-enc-1',
          user_name: 'bnewhire@ldap.corp',
          name: 'Bob',
          last_name: 'Newhire',
          email: 'bob.newhire@corp.example',
          department: 'Eng',
          principal: 'bnewhire@LDAP.CORP',
          namespace: 'dc=ldap,dc=corp',
          domain_entry_id: 'dei-1',
          domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
        },
      ],
    })

    const users = await listDirectoryUsers('ldap.corp-authz', { search: 'name=b*' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/domains/ldap.corp-authz/users?search=name%3Db*',
    )
    expect(users[0].principal).toBe('bnewhire@LDAP.CORP')
    expect(users[0].namespace).toBe('dc=ldap,dc=corp')
    expect(users[0].domain_entry_id).toBe('dei-1')
    expect(users[0].department).toBe('Eng')
    expect(users[0].domain?.id).toBe('ldap.corp-authz')
  })

  it('omits the query string when no search is given (engine lists all)', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(listDirectoryUsers('internal-authz')).resolves.toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/domains/internal-authz/users')
  })

  it('treats an empty-string search as no search (no query string)', async () => {
    const fetchMock = mockFetch(200, {})
    await listDirectoryUsers('internal-authz', { search: '' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/domains/internal-authz/users')
  })

  it('encodes the domain id path segment', async () => {
    const fetchMock = mockFetch(200, {})
    await listDirectoryUsers('weird/id authz')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/domains/weird%2Fid%20authz/users')
  })
})

describe('addUser', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs a snake_case body forwarding every identity key, keyed by domain id', async () => {
    const fetchMock = mockFetch(200, {
      id: 'db-guid-1',
      user_name: 'bnewhire@ldap.corp',
      name: 'Bob',
      last_name: 'Newhire',
      domain: { id: 'ldap.corp-authz', name: 'ldap.corp' },
    })

    const created = await addUser({
      userName: 'bnewhire@ldap.corp',
      domainId: 'ldap.corp-authz',
      id: 'dir-enc-1',
      domainEntryId: 'dei-1',
      principal: 'bnewhire@LDAP.CORP',
      namespace: 'dc=ldap,dc=corp',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      user_name: 'bnewhire@ldap.corp',
      domain: { id: 'ldap.corp-authz' },
      id: 'dir-enc-1',
      domain_entry_id: 'dei-1',
      principal: 'bnewhire@LDAP.CORP',
      namespace: 'dc=ldap,dc=corp',
    })
    // returns the created (now DB-backed) user
    expect(created.id).toBe('db-guid-1')
    expect(created.domain?.id).toBe('ldap.corp-authz')
  })

  it('keys the domain by name when only domainName is given', async () => {
    const fetchMock = mockFetch(200, { id: 'db-guid-2', user_name: 'jdoe@ldap.corp' })
    await addUser({ userName: 'jdoe@ldap.corp', domainName: 'ldap.corp' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      user_name: 'jdoe@ldap.corp',
      domain: { name: 'ldap.corp' },
    })
  })

  it('drops undefined keys — a bare userName sends only user_name (no domain)', async () => {
    const fetchMock = mockFetch(200, { id: 'db-guid-3', user_name: 'admin@internal' })
    await addUser({ userName: 'admin@internal' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ user_name: 'admin@internal' })
  })

  it('surfaces an engine fault (unresolvable principal) as ApiError.message', async () => {
    mockFetch(400, {
      fault: {
        reason: 'Operation Failed',
        detail: 'No such user: ghost@ldap.corp in domain ldap.corp',
      },
    })

    await expect(
      addUser({ userName: 'ghost@ldap.corp', domainId: 'ldap.corp-authz' }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'No such user: ghost@ldap.corp in domain ldap.corp',
    })
  })
})

describe('removeUser', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('sends a bodiless DELETE to /users/{id} and resolves void', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(removeUser('db-guid-1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/users/db-guid-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('resolves void on a 204 (no body)', async () => {
    mockFetch(204)
    await expect(removeUser('db-guid-1')).resolves.toBeUndefined()
  })

  it('encodes the id path segment', async () => {
    const fetchMock = mockFetch(200, {})
    await removeUser('guid/with space')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/users/guid%2Fwith%20space')
  })

  it('propagates an engine fault (user still owns objects) as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Conflict', detail: 'Cannot remove user: owns objects' } })
    const err = await removeUser('db-guid-1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(409)
    expect((err as ApiError).message).toBe('Cannot remove user: owns objects')
  })
})
