import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listOtherConsoleUsers, listVmSessions } from './vmSessions'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/users.test.ts. The resource is
// unit-tested against a stubbed global fetch so it never touches the mock
// engine (owned elsewhere): assert the URL/method it emits and the parsed
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

describe('listVmSessions', () => {
  it('GETs /vms/{id}/sessions and parses a console session', async () => {
    const fetchMock = mockFetch(200, {
      session: [
        {
          id: 'session-01',
          // the live engine serializes the boolean as a JSON string
          console_user: 'true',
          protocol: 'spice',
          ip: { address: '192.168.1.50' },
          user: { id: 'user-01', user_name: 'admin@internal' },
        },
      ],
    })

    const sessions = await listVmSessions('vm-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm-01/sessions')
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.console_user).toBe(true)
    expect(sessions[0]?.ip?.address).toBe('192.168.1.50')
    expect(sessions[0]?.user?.user_name).toBe('admin@internal')
  })

  it('encodes the id and tolerates the empty-collection quirk', async () => {
    const fetchMock = mockFetch(200, {})
    await expect(listVmSessions('vm 7')).resolves.toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm%207/sessions')
  })

  it('surfaces an engine fault as ApiError', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'No such VM' } })
    const error = await listVmSessions('vm-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'No such VM' })
  })
})

// The console-in-use warning: a VM whose console another user held
// refused every other user's ticket.
describe('listOtherConsoleUsers', () => {
  it('names other console holders, not the signed-in user or guest logins', async () => {
    const fn = vi.fn((url: string) => {
      const payload = url.endsWith('/sessions')
        ? {
            session: [
              { console_user: 'true', user: { id: 'u-admin', user_name: 'admin' } },
              { user: { user_name: 'Unknown' } },
              { console_user: 'true', user: { id: 'u-me', user_name: 'me' } },
            ],
          }
        : { authenticated_user: { id: 'u-me' } }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
    })
    vi.stubGlobal('fetch', fn)

    expect(await listOtherConsoleUsers('vm-1')).toEqual(['admin'])
  })
})
