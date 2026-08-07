import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addVmMediatedDevice,
  listHostMdevTypes,
  listVmMediatedDevices,
  mdevType,
  removeVmMediatedDevice,
  specParam,
} from './mediatedDevices'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (mirrors the other resource tests) so these cover
// the wire shape without reaching the mock engine.
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

describe('listVmMediatedDevices', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /vms/{id}/mediateddevices and exposes spec_params via helpers', async () => {
    const fetchMock = mockFetch(200, {
      vm_mediated_device: [
        {
          id: 'mdev-1',
          spec_params: {
            property: [
              { name: 'mdevType', value: 'nvidia-11' },
              { name: 'nodisplay', value: 'true' },
            ],
          },
        },
      ],
    })

    const devices = await listVmMediatedDevices('vm-01')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/mediateddevices')
    expect(init.method ?? 'GET').toBe('GET')
    expect(devices).toHaveLength(1)
    expect(mdevType(devices[0])).toBe('nvidia-11')
    expect(specParam(devices[0], 'nodisplay')).toBe('true')
    expect(mdevType({ id: 'x' })).toBeUndefined()
  })

  it('returns [] when the vm_mediated_device key is omitted', async () => {
    mockFetch(200, {})
    await expect(listVmMediatedDevices('vm-01')).resolves.toEqual([])
  })

  it('degrades a 404 (optional subcollection) to []', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no such subcollection' } })
    await expect(listVmMediatedDevices('vm-01')).resolves.toEqual([])
  })

  it('surfaces a non-404 fault envelope as ApiError', async () => {
    mockFetch(500, { fault: { reason: 'Server Error', detail: 'boom' } })
    const error = await listVmMediatedDevices('vm-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500 })
  })
})

describe('addVmMediatedDevice', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs the mdev type as a spec_params property', async () => {
    const fetchMock = mockFetch(200, { id: 'mdev-2' })
    await addVmMediatedDevice('vm-01', { mdevType: 'nvidia-11' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-01/mediateddevices')
    expect(init.method).toBe('POST')
    expect(bodyOf(fetchMock)).toEqual({
      spec_params: { property: [{ name: 'mdevType', value: 'nvidia-11' }] },
    })
  })

  it('sends nodisplay (stringified) and pass-through extra params when set', async () => {
    const fetchMock = mockFetch(200, { id: 'mdev-3' })
    await addVmMediatedDevice('vm-01', {
      mdevType: 'nvidia-11',
      nodisplay: false,
      extraParams: [{ name: 'ramfb', value: 'on' }],
    })

    expect(bodyOf(fetchMock)).toEqual({
      spec_params: {
        property: [
          { name: 'mdevType', value: 'nvidia-11' },
          { name: 'nodisplay', value: 'false' },
          { name: 'ramfb', value: 'on' },
        ],
      },
    })
  })
})

describe('removeVmMediatedDevice', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('DELETEs /vms/{id}/mediateddevices/{deviceId}, encoding both ids', async () => {
    const fetchMock = mockFetch(204)
    await removeVmMediatedDevice('vm 1', 'mdev/9')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm%201/mediateddevices/mdev%2F9')
    expect(init.method).toBe('DELETE')
  })
})

describe('listHostMdevTypes', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('collects and dedupes m_dev_types across the host devices, coercing counts', async () => {
    const fetchMock = mockFetch(200, {
      host_device: [
        { id: 'dev-a', capability: 'pci' },
        {
          id: 'dev-gpu',
          m_dev_types: {
            m_dev_type: [
              // available_instances arrives as a JSON string
              { name: 'nvidia-11', human_readable_name: 'GRID M60-1Q', available_instances: '4' },
              { name: 'nvidia-12', available_instances: '2' },
            ],
          },
        },
        // a duplicate name from a sibling GPU is dropped
        { id: 'dev-gpu2', m_dev_types: { m_dev_type: [{ name: 'nvidia-11' }] } },
      ],
    })

    const types = await listHostMdevTypes('host-01')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/devices')
    expect(types.map((type) => type.name)).toEqual(['nvidia-11', 'nvidia-12'])
    expect(types[0].available_instances).toBe(4)
    expect(types[0].human_readable_name).toBe('GRID M60-1Q')
  })

  it('returns [] on a GPU-less host (no m_dev_types reported)', async () => {
    mockFetch(200, { host_device: [{ id: 'dev-a', capability: 'usb_device' }] })
    await expect(listHostMdevTypes('host-01')).resolves.toEqual([])
  })

  it('degrades a 404 to []', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no devices' } })
    await expect(listHostMdevTypes('host-01')).resolves.toEqual([])
  })
})
