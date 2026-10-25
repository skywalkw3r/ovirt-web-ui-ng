import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addNicNetworkFilterParameter,
  applyNetworkFilterParameterPlan,
  isEmptyPlan,
  listNicNetworkFilterParameters,
  planNetworkFilterParameterChanges,
  removeNicNetworkFilterParameter,
  updateNicNetworkFilterParameter,
} from './nicNetworkFilterParameters'
import { clearSessionToken, setSessionToken } from '../session'

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

function calls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls.map(([url, init]) => {
    const request = init as RequestInit
    return {
      url: url as string,
      method: request.method,
      body: request.body === undefined ? undefined : (JSON.parse(String(request.body)) as unknown),
    }
  })
}

const BASE = '/ovirt-engine/api/vms/vm-01/nics/nic-1/networkfilterparameters'

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('listNicNetworkFilterParameters', () => {
  it('GETs the subcollection and coerces a numeric value to string', async () => {
    const fetchMock = mockFetch(200, {
      network_filter_parameter: [
        { id: 'p1', name: 'IP', value: '10.0.0.1', nic: { id: 'nic-1' } },
        { id: 'p2', name: 'PORT', value: 8080 },
      ],
    })
    const parameters = await listNicNetworkFilterParameters('vm-01', 'nic-1')
    expect(calls(fetchMock)[0]?.url).toBe(BASE)
    expect(parameters.map((p) => [p.name, p.value])).toEqual([
      ['IP', '10.0.0.1'],
      ['PORT', '8080'],
    ])
  })

  it('normalizes the omitted-key empty collection and a 404 to []', async () => {
    mockFetch(200, {})
    await expect(listNicNetworkFilterParameters('vm-01', 'nic-1')).resolves.toEqual([])
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listNicNetworkFilterParameters('vm-01', 'nic-1')).resolves.toEqual([])
  })
})

describe('network filter parameter writes', () => {
  it('POSTs, PUTs and DELETEs { name, value } at the documented paths', async () => {
    const fetchMock = mockFetch(200, { id: 'p9', name: 'IP', value: '10.0.0.9' })
    await addNicNetworkFilterParameter('vm-01', 'nic-1', { name: 'IP', value: '10.0.0.9' })
    await updateNicNetworkFilterParameter('vm-01', 'nic-1', 'p9', { name: 'IP', value: '1.1.1.1' })
    await removeNicNetworkFilterParameter('vm-01', 'nic-1', 'p9')
    expect(calls(fetchMock)).toEqual([
      { url: BASE, method: 'POST', body: { name: 'IP', value: '10.0.0.9' } },
      { url: `${BASE}/p9`, method: 'PUT', body: { name: 'IP', value: '1.1.1.1' } },
      { url: `${BASE}/p9`, method: 'DELETE', body: undefined },
    ])
  })
})

describe('planNetworkFilterParameterChanges', () => {
  const loaded = [
    { id: 'p1', name: 'IP', value: '10.0.0.1' },
    { id: 'p2', name: 'CTRL_IP_LEARNING', value: 'none' },
    { id: 'p3', name: 'DHCPSERVER', value: '10.0.0.254' },
  ]

  it('is empty when the rows mirror the loaded set', () => {
    const rows = loaded.map((p) => ({ id: p.id, name: p.name, value: p.value }))
    expect(isEmptyPlan(planNetworkFilterParameterChanges(loaded, rows))).toBe(true)
  })

  it('removes dropped or blanked rows, updates moved ones, adds named new rows', () => {
    const plan = planNetworkFilterParameterChanges(loaded, [
      { id: 'p1', name: 'IP', value: '10.0.0.2' },
      // blanking a loaded row's name is a removal
      { id: 'p2', name: '  ', value: 'none' },
      // p3 deleted from the table
      { name: ' IP ', value: '10.0.0.3' },
      // a half-typed row never reaches the wire
      { name: '', value: 'stray' },
    ])
    expect(plan).toEqual({
      remove: ['p2', 'p3'],
      update: [{ id: 'p1', name: 'IP', value: '10.0.0.2' }],
      add: [{ name: 'IP', value: '10.0.0.3' }],
    })
  })

  it('treats every named row as an add for a new NIC', () => {
    const plan = planNetworkFilterParameterChanges([], [{ name: 'IP', value: '10.0.0.1' }])
    expect(plan).toEqual({ remove: [], update: [], add: [{ name: 'IP', value: '10.0.0.1' }] })
  })
})

describe('applyNetworkFilterParameterPlan', () => {
  it('applies removes, then updates, then adds', async () => {
    const fetchMock = mockFetch(200, { id: 'new' })
    await applyNetworkFilterParameterPlan('vm-01', 'nic-1', {
      add: [{ name: 'IP', value: '10.0.0.3' }],
      update: [{ id: 'p1', name: 'IP', value: '10.0.0.2' }],
      remove: ['p2'],
    })
    expect(calls(fetchMock).map((c) => `${c.method} ${c.url}`)).toEqual([
      `DELETE ${BASE}/p2`,
      `PUT ${BASE}/p1`,
      `POST ${BASE}`,
    ])
  })
})
