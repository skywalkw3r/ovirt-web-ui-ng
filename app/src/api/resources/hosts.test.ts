import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addVfAllowedLabel,
  addVfAllowedNetwork,
  approveHost,
  fenceHost,
  forceSelectSpm,
  getHost,
  hostAction,
  hostUpgradeCheck,
  listHostNicDetails,
  listHostsUsage,
  listVfAllowedLabels,
  listVfAllowedNetworks,
  removeVfAllowedLabel,
  removeVfAllowedNetwork,
  updateHostNicVf,
  upgradeHost,
} from './hosts'
import { ApiError } from '../transport'
import { clearSessionToken, setSessionToken } from '../session'

// Transport-level fetch stub (copied from api/vms.test.ts) — exercises the
// resource fns without the mock engine, so the exact path/verb/body is asserted.
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

// all_content=true is what makes the live engine return the computed host
// properties — hosted_engine (the HE crown) above all — so both the list and
// the detail read must carry it or the crown silently never renders.
describe('host reads request all_content for computed properties', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listHostsUsage passes all_content=true alongside the statistics follow', async () => {
    const fetchMock = mockFetch(200, { host: [] })
    await listHostsUsage()
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('all_content=true')
    expect(url).toContain('follow=statistics')
  })

  it('getHost passes all_content=true alongside follow=cluster', async () => {
    const fetchMock = mockFetch(200, { id: 'host-01', name: 'node-01' })
    await getHost('host-01')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/hosts/host-01?')
    expect(url).toContain('all_content=true')
    expect(url).toContain('follow=cluster')
  })
})

describe('forceSelectSpm', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs an empty action body to /hosts/{id}/forceselectspm', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(forceSelectSpm('host-01')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/forceselectspm')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Host is already the SPM' } })

    const error = await forceSelectSpm('host-01').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Host is already the SPM' })
  })
})

describe('approveHost', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs an empty action body to /hosts/{id}/approve', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(approveHost('host-02')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-02/approve')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
  })

  it('encodes the host id', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await approveHost('a b/c')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/a%20b%2Fc/approve')
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Host is not pending approval' },
    })

    const error = await approveHost('host-02').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Host is not pending approval' })
  })
})

describe('hostUpgradeCheck', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs an empty action body to /hosts/{id}/upgradecheck', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(hostUpgradeCheck('host-03')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-03/upgradecheck')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('encodes the host id', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await hostUpgradeCheck('a b/c')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/a%20b%2Fc/upgradecheck')
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'Host is not up' } })

    const error = await hostUpgradeCheck('host-03').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Host is not up' })
  })
})

describe('upgradeHost', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs an empty body to /hosts/{id}/upgrade by default (engine defaults reboot=true)', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(upgradeHost('host-04')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-04/upgrade')
    expect(init.method).toBe('POST')
    // reboot is omitted so the engine applies its default (true)
    expect(init.body).toBe('{}')
  })

  it('sends reboot=false only when the caller opts out', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await upgradeHost('host-04', { reboot: false })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe('{"reboot":false}')
  })

  it('omits the reboot flag when reboot is explicitly true', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await upgradeHost('host-04', { reboot: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe('{}')
  })

  it('surfaces the fault envelope as ApiError', async () => {
    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'No updates available' } })

    const error = await upgradeHost('host-04').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'No updates available' })
  })
})

describe('hostAction', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs an empty action body to /hosts/{id}/{action} and surfaces faults', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(hostAction('host-01', 'deactivate')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/deactivate')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    vi.unstubAllGlobals()

    mockFetch(409, { fault: { reason: 'Operation Failed', detail: 'has running VMs' } })
    const error = await hostAction('host-01', 'deactivate').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'has running VMs' })
  })
})

describe('fenceHost', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs the fence_type to /hosts/{id}/fence', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await expect(fenceHost('host-01', 'restart')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/fence')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ fence_type: 'restart' })
  })
})

describe('listHostNicDetails', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('follows network_labels and maps labels + coerced VF config', async () => {
    const fetchMock = mockFetch(200, {
      host_nic: [
        {
          id: 'nic-sriov',
          name: 'eno5',
          // scalars ride as JSON strings on the live engine — coercion under test
          virtual_functions_configuration: {
            max_number_of_virtual_functions: '7',
            number_of_virtual_functions: '2',
            all_networks_allowed: 'false',
          },
          network_labels: { network_label: [{ id: 'red' }, { id: 'blue' }] },
        },
        { id: 'nic-plain', name: 'eno6' },
      ],
    })

    const details = await listHostNicDetails('host-01')
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/nics?follow=network_labels')
    expect(details).toHaveLength(2)
    expect(details[0]).toMatchObject({
      id: 'nic-sriov',
      name: 'eno5',
      labels: ['red', 'blue'],
      vf: { max: 7, count: 2, allNetworksAllowed: false },
    })
    // a NIC without VF config has no vf slice and empty labels
    expect(details[1]).toEqual({ id: 'nic-plain', name: 'eno6', labels: [], vf: undefined })
  })

  it('degrades to a bare read when the followed read 500s', async () => {
    // first call (followed) 500s, second (bare) succeeds — VF config survives
    const responses = [
      {
        ok: false,
        status: 500,
        json: () => Promise.resolve({ fault: { detail: 'follow blew up' } }),
      },
      {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            host_nic: [
              {
                id: 'nic-sriov',
                name: 'eno5',
                virtual_functions_configuration: { max_number_of_virtual_functions: 4 },
              },
            ],
          }),
      },
    ]
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()))
    vi.stubGlobal('fetch', fetchMock)

    const details = await listHostNicDetails('host-01')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe('/ovirt-engine/api/hosts/host-01/nics')
    expect(details[0]).toMatchObject({ id: 'nic-sriov', labels: [], vf: { max: 4 } })
  })
})

describe('updateHostNicVf', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs the VF config to updatevirtualfunctionsconfiguration', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await updateHostNicVf('host-01', 'nic-sriov', {
      numberOfVirtualFunctions: 3,
      allNetworksAllowed: false,
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      '/ovirt-engine/api/hosts/host-01/nics/nic-sriov/updatevirtualfunctionsconfiguration',
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      virtual_functions_configuration: {
        number_of_virtual_functions: 3,
        all_networks_allowed: false,
      },
    })
  })

  it('omits fields the caller did not set', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await updateHostNicVf('host-01', 'nic-sriov', { allNetworksAllowed: true })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      virtual_functions_configuration: { all_networks_allowed: true },
    })
  })
})

describe('VF allowed labels', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('lists the allowed label ids', async () => {
    const fetchMock = mockFetch(200, { network_label: [{ id: 'red' }, { id: 'green' }] })
    const labels = await listVfAllowedLabels('host-01', 'nic-sriov')
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/nics/nic-sriov/virtualfunctionallowedlabels')
    expect(labels).toEqual(['red', 'green'])
  })

  it('treats a 404 subcollection as empty', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no such collection' } })
    await expect(listVfAllowedLabels('host-01', 'nic-sriov')).resolves.toEqual([])
  })

  it('POSTs a label id to add and DELETEs by id to remove', async () => {
    const addMock = mockFetch(200, { id: 'red' })
    await addVfAllowedLabel('host-01', 'nic-sriov', 'red')
    const [addUrl, addInit] = addMock.mock.calls[0] as [string, RequestInit]
    expect(addUrl).toBe(
      '/ovirt-engine/api/hosts/host-01/nics/nic-sriov/virtualfunctionallowedlabels',
    )
    expect(addInit.method).toBe('POST')
    expect(JSON.parse(addInit.body as string)).toEqual({ id: 'red' })
    vi.unstubAllGlobals()

    const delMock = mockFetch(204)
    await removeVfAllowedLabel('host-01', 'nic-sriov', 'red')
    const [delUrl, delInit] = delMock.mock.calls[0] as [string, RequestInit]
    expect(delUrl).toBe(
      '/ovirt-engine/api/hosts/host-01/nics/nic-sriov/virtualfunctionallowedlabels/red',
    )
    expect(delInit.method).toBe('DELETE')
  })
})

describe('VF allowed networks', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('lists the allowed networks', async () => {
    const fetchMock = mockFetch(200, {
      network: [{ id: 'net-05', name: 'sriov-net' }],
    })
    const nets = await listVfAllowedNetworks('host-01', 'nic-sriov')
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      '/ovirt-engine/api/hosts/host-01/nics/nic-sriov/virtualfunctionallowednetworks',
    )
    expect(nets).toEqual([{ id: 'net-05', name: 'sriov-net' }])
  })

  it('treats a 404 subcollection as empty', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no such collection' } })
    await expect(listVfAllowedNetworks('host-01', 'nic-sriov')).resolves.toEqual([])
  })

  it('POSTs a network id to add and DELETEs by id to remove', async () => {
    const addMock = mockFetch(200, { id: 'net-05' })
    await addVfAllowedNetwork('host-01', 'nic-sriov', 'net-05')
    const [addUrl, addInit] = addMock.mock.calls[0] as [string, RequestInit]
    expect(addUrl).toBe(
      '/ovirt-engine/api/hosts/host-01/nics/nic-sriov/virtualfunctionallowednetworks',
    )
    expect(addInit.method).toBe('POST')
    expect(JSON.parse(addInit.body as string)).toEqual({ id: 'net-05' })
    vi.unstubAllGlobals()

    const delMock = mockFetch(204)
    await removeVfAllowedNetwork('host-01', 'nic-sriov', 'net-05')
    const [delUrl, delInit] = delMock.mock.calls[0] as [string, RequestInit]
    expect(delUrl).toBe(
      '/ovirt-engine/api/hosts/host-01/nics/nic-sriov/virtualfunctionallowednetworks/net-05',
    )
    expect(delInit.method).toBe('DELETE')
  })
})
