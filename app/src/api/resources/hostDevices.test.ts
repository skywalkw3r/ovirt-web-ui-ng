import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachVmHostDevice, detachVmHostDevice } from './hostDevices'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub — copied from api/resources/users.test.ts. The
// resource is unit-tested against a stubbed global fetch so it never touches
// the mock engine (owned elsewhere): assert the URL/method/body it emits and
// the parsed result it returns.
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

function bodyOf(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('attachVmHostDevice', () => {
  it('POSTs /vms/{id}/hostdevices with the device id and parses the created device', async () => {
    const fetchMock = mockFetch(201, {
      id: 'dev-0000_04_00_0',
      name: 'pci_0000_04_00_0',
      capability: 'pci',
      vendor: { name: 'Intel Corporation' },
      product: 'Ethernet Controller X710',
    })

    const device = await attachVmHostDevice('vm-01', { id: 'dev-0000_04_00_0' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/hostdevices')
    expect(init.method).toBe('POST')
    expect(bodyOf(fetchMock)).toEqual({ id: 'dev-0000_04_00_0' })
    // vendor/product come back in both object and bare-string forms; the shared
    // schema coerces either.
    expect(device.id).toBe('dev-0000_04_00_0')
    expect(device.capability).toBe('pci')
  })

  it('sends the name form when the ref carries a name instead of an id', async () => {
    const fetchMock = mockFetch(201, { id: 'dev-1', name: 'pci_0000_01_00_0', capability: 'pci' })
    await attachVmHostDevice('vm-01', { name: 'pci_0000_01_00_0' })
    expect(bodyOf(fetchMock)).toEqual({ name: 'pci_0000_01_00_0' })
  })

  it('encodes the vm id and surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'VM must be pinned to a single host' },
    })
    const error = await attachVmHostDevice('bad id', { id: 'dev-1' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'VM must be pinned to a single host' })
  })
})

describe('detachVmHostDevice', () => {
  it('DELETEs /vms/{id}/hostdevices/{deviceId} and resolves void', async () => {
    const fetchMock = mockFetch(204)
    await expect(detachVmHostDevice('vm-01', 'dev-0000_04_00_0')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/hostdevices/dev-0000_04_00_0')
    expect(init.method).toBe('DELETE')
  })

  it('encodes both path segments', async () => {
    const fetchMock = mockFetch(204)
    await detachVmHostDevice('vm 01', 'dev/1')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/vms/vm%2001/hostdevices/dev%2F1')
  })

  it('surfaces an engine fault verbatim as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Device is in use' } })
    const error = await detachVmHostDevice('vm-01', 'dev-1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Device is in use' })
  })
})
