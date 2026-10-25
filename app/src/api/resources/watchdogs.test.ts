import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addVmWatchdog,
  applyWatchdogChange,
  listVmWatchdogs,
  removeVmWatchdog,
  updateVmWatchdog,
} from './watchdogs'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (vmSessions.test.ts pattern): assert the URL,
// method and body each call emits and the parsed result it returns.
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

function call(fetchMock: ReturnType<typeof mockFetch>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit]
  return {
    url,
    method: init.method,
    body: init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
  }
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('listVmWatchdogs', () => {
  it('GETs /vms/{id}/watchdogs and parses the device', async () => {
    const fetchMock = mockFetch(200, {
      watchdog: [
        {
          id: '00000000-0000-0000-0000-000000000000',
          model: 'i6300esb',
          action: 'poweroff',
          vm: { id: 'vm-01' },
        },
      ],
    })
    const watchdogs = await listVmWatchdogs('vm-01')
    expect(call(fetchMock).url).toBe('/ovirt-engine/api/vms/vm-01/watchdogs')
    expect(watchdogs).toEqual([expect.objectContaining({ model: 'i6300esb', action: 'poweroff' })])
  })

  it('normalizes the omitted-key empty collection and a 404 to []', async () => {
    mockFetch(200, {})
    await expect(listVmWatchdogs('vm-01')).resolves.toEqual([])
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listVmWatchdogs('vm-01')).resolves.toEqual([])
  })

  it('surfaces other faults as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Operation Failed', detail: 'boom' } })
    const error = await listVmWatchdogs('vm-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500, message: 'boom' })
  })
})

describe('watchdog writes', () => {
  it('POSTs model + action and parses the created device', async () => {
    const fetchMock = mockFetch(201, { id: 'w1', model: 'diag288', action: 'reset' })
    const created = await addVmWatchdog('vm 1', { model: 'diag288', action: 'reset' })
    expect(call(fetchMock)).toEqual({
      url: '/ovirt-engine/api/vms/vm%201/watchdogs',
      method: 'POST',
      body: { model: 'diag288', action: 'reset' },
    })
    expect(created.id).toBe('w1')
  })

  it('PUTs both fields to the device and DELETEs it', async () => {
    let fetchMock = mockFetch(200, { id: 'w1' })
    await updateVmWatchdog('vm-01', 'w1', { model: 'i6300esb', action: 'pause' })
    expect(call(fetchMock)).toEqual({
      url: '/ovirt-engine/api/vms/vm-01/watchdogs/w1',
      method: 'PUT',
      body: { model: 'i6300esb', action: 'pause' },
    })
    fetchMock = mockFetch(200, {})
    await removeVmWatchdog('vm-01', 'w1')
    expect(call(fetchMock)).toMatchObject({
      url: '/ovirt-engine/api/vms/vm-01/watchdogs/w1',
      method: 'DELETE',
    })
  })

  it('applyWatchdogChange routes each change kind to its call', async () => {
    let fetchMock = mockFetch(201, { id: 'w1' })
    await applyWatchdogChange('vm-01', { kind: 'add', model: 'i6300esb', action: 'none' })
    expect(call(fetchMock).method).toBe('POST')

    fetchMock = mockFetch(200, { id: 'w1' })
    await applyWatchdogChange('vm-01', {
      kind: 'update',
      id: 'w1',
      model: 'i6300esb',
      action: 'dump',
    })
    expect(call(fetchMock)).toMatchObject({ method: 'PUT', body: { action: 'dump' } })

    fetchMock = mockFetch(200, {})
    await applyWatchdogChange('vm-01', { kind: 'remove', id: 'w1' })
    expect(call(fetchMock)).toMatchObject({
      url: '/ovirt-engine/api/vms/vm-01/watchdogs/w1',
      method: 'DELETE',
    })
  })
})
