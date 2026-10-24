import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addVmNic, listVmNics, listVmNicStatistics, nicThroughput, updateVmNic } from './nics'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (mirrors the mockFetch helper in the other
// resource tests) so these cover the wire shape without reaching the mock
// engine.
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

describe('listVmNics', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('parses interface, vnic_profile link, and mac (coercing string booleans)', async () => {
    mockFetch(200, {
      nic: [
        {
          id: 'nic-1',
          name: 'nic1',
          interface: 'e1000e',
          // the live engine serializes booleans as strings
          plugged: 'true',
          linked: 'false',
          mac: { address: '00:1a:4a:16:01:51' },
          vnic_profile: { id: 'profile-9' },
        },
      ],
    })

    const [nic] = await listVmNics('vm-1')
    expect(nic.interface).toBe('e1000e')
    expect(nic.plugged).toBe(true)
    expect(nic.linked).toBe(false)
    expect(nic.mac?.address).toBe('00:1a:4a:16:01:51')
    expect(nic.vnic_profile?.id).toBe('profile-9')
  })

  it('returns [] when the engine omits the nic key (empty list)', async () => {
    mockFetch(200, {})
    await expect(listVmNics('vm-1')).resolves.toEqual([])
  })
})

describe('listVmNicStatistics', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs the NIC statistics subcollection and coerces the string datum', async () => {
    const fetchMock = mockFetch(200, {
      statistic: [
        {
          id: 's1',
          name: 'data.current.rx.bps',
          // the live engine serializes the datum as a JSON string
          values: { value: [{ datum: '1048576' }] },
        },
        { id: 's2', name: 'data.current.tx.bps', values: { value: [{ datum: 524288 }] } },
      ],
    })

    const stats = await listVmNicStatistics('vm-1', 'nic-1')
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-1/nics/nic-1/statistics')
    expect(stats).toHaveLength(2)
    expect(stats[0].values?.value?.[0]?.datum).toBe(1048576)
  })

  it('returns [] when the engine omits the statistic key (a down NIC)', async () => {
    mockFetch(200, {})
    await expect(listVmNicStatistics('vm-1', 'nic-1')).resolves.toEqual([])
  })
})

describe('nicThroughput', () => {
  it('picks the rx/tx bps gauges by name', () => {
    const { rxBps, txBps } = nicThroughput([
      { id: 's1', name: 'data.current.rx.bps', values: { value: [{ datum: 2048 }] } },
      { id: 's2', name: 'data.current.tx.bps', values: { value: [{ datum: 512 }] } },
      { id: 's3', name: 'data.total.rx', values: { value: [{ datum: 99 }] } },
    ])
    expect(rxBps).toBe(2048)
    expect(txBps).toBe(512)
  })

  it('leaves a missing direction undefined rather than defaulting to 0', () => {
    const { rxBps, txBps } = nicThroughput([
      { id: 's1', name: 'data.current.rx.bps', values: { value: [{ datum: 2048 }] } },
    ])
    expect(rxBps).toBe(2048)
    expect(txBps).toBeUndefined()
  })
})

describe('addVmNic', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs a virtio, plugged, linked NIC and drops the unset mac/profile keys', async () => {
    const fetchMock = mockFetch(200, {})
    await addVmNic('vm-1', { name: 'nic1' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-1/nics')
    expect(init.method).toBe('POST')
    // JSON.stringify drops the undefined vnic_profile/mac, so a pool-assigned
    // NIC never sends a mac and an unprofiled one never sends vnic_profile
    expect(bodyOf(fetchMock)).toEqual({
      name: 'nic1',
      interface: 'virtio',
      plugged: true,
      linked: true,
    })
  })

  it('sends the chosen card model, link/plug state, profile id, and custom mac', async () => {
    const fetchMock = mockFetch(200, {})
    await addVmNic('vm-1', {
      name: 'nic2',
      interface: 'e1000e',
      linked: false,
      plugged: false,
      vnicProfileId: 'profile-9',
      macAddress: '00:1a:4a:16:01:51',
    })

    expect(bodyOf(fetchMock)).toEqual({
      name: 'nic2',
      interface: 'e1000e',
      plugged: false,
      linked: false,
      vnic_profile: { id: 'profile-9' },
      mac: { address: '00:1a:4a:16:01:51' },
    })
  })
})

describe('updateVmNic', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('PUTs only the patched fields (profile-only edit)', async () => {
    const fetchMock = mockFetch(200, {})
    await updateVmNic('vm-1', 'nic-1', { vnicProfileId: 'profile-2' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/vms/vm-1/nics/nic-1')
    expect(init.method).toBe('PUT')
    expect(bodyOf(fetchMock)).toEqual({ vnic_profile: { id: 'profile-2' } })
  })

  it('sends interface and a custom mac when the card model / mac change', async () => {
    const fetchMock = mockFetch(200, {})
    await updateVmNic('vm-1', 'nic-1', {
      interface: 'rtl8139',
      macAddress: '00:1a:4a:16:01:99',
    })

    expect(bodyOf(fetchMock)).toEqual({
      interface: 'rtl8139',
      mac: { address: '00:1a:4a:16:01:99' },
    })
  })

  it('preserves a plugged:false patch (false is not dropped as undefined)', async () => {
    const fetchMock = mockFetch(200, {})
    await updateVmNic('vm-1', 'nic-1', { plugged: false })
    expect(bodyOf(fetchMock)).toEqual({ plugged: false })
  })
})
