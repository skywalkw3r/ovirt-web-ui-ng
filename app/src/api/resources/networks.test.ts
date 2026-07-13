import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteNetwork,
  listNetworkHosts,
  listNetworkTemplates,
  listNetworkVms,
  updateNetwork,
} from './networks'
import { clearSessionToken, setSessionToken } from '../session'

// URL-routed fetch stub (extends the vms.test.ts / hosts.test.ts single-payload
// mockFetch to a table): the membership reads fan out across several endpoints,
// so each response is keyed by the request path (API base stripped, query kept).
// An unmapped path answers 404 so a stray call is loud, not silent.
function routedFetch(routes: Record<string, unknown>) {
  const fn = vi.fn((url: string) => {
    const path = url.replace('/ovirt-engine/api', '')
    if (!(path in routes)) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ fault: { reason: 'Not Found', detail: path } }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(routes[path]) })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => setSessionToken('tok-123'))
afterEach(() => {
  clearSessionToken()
  vi.unstubAllGlobals()
})

describe('listNetworkHosts', () => {
  it('fans out over hosts and keeps only those with this network attached', async () => {
    routedFetch({
      '/hosts': {
        host: [
          { id: 'host-01', name: 'node-01' },
          { id: 'host-02', name: 'node-02' },
          { id: 'host-03', name: 'node-03' },
        ],
      },
      // in_sync absent → treated as in sync
      '/hosts/host-01/networkattachments?follow=network': {
        network_attachment: [{ id: 'a1', network: { id: 'net-01' } }],
      },
      // engine serializes the boolean as the JSON string "false" → out of sync
      '/hosts/host-02/networkattachments?follow=network': {
        network_attachment: [{ id: 'a2', network: { id: 'net-01' }, in_sync: 'false' }],
      },
      // attached to a different network only → excluded
      '/hosts/host-03/networkattachments?follow=network': {
        network_attachment: [{ id: 'a3', network: { id: 'net-99' }, in_sync: true }],
      },
    })

    const rows = await listNetworkHosts('net-01')

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.host.id)).toEqual(['host-01', 'host-02'])
    expect(rows[0]).toMatchObject({ host: { id: 'host-01', name: 'node-01' }, inSync: true })
    expect(rows[1]).toMatchObject({ host: { id: 'host-02' }, inSync: false })
  })

  it('returns an empty list when no host carries the network', async () => {
    routedFetch({
      '/hosts': { host: [{ id: 'host-01', name: 'node-01' }] },
      // engine omits the list key entirely when the host has no attachments
      '/hosts/host-01/networkattachments?follow=network': {},
    })

    await expect(listNetworkHosts('net-01')).resolves.toEqual([])
  })
})

describe('listNetworkVms', () => {
  it('keeps VMs whose NIC uses a vNIC profile on this network', async () => {
    const fetchMock = routedFetch({
      '/networks/net-01/vnicprofiles': {
        vnic_profile: [
          { id: 'vnic-01', name: 'mgmt' },
          { id: 'vnic-02', name: 'prod' },
        ],
      },
      '/vms?follow=nics': {
        vm: [
          {
            id: 'vm-1',
            name: 'a',
            status: 'up',
            nics: { nic: [{ id: 'vm-1-nic0', vnic_profile: { id: 'vnic-01' } }] },
          },
          {
            id: 'vm-2',
            name: 'b',
            status: 'down',
            nics: { nic: [{ id: 'vm-2-nic0', vnic_profile: { id: 'vnic-99' } }] },
          },
          { id: 'vm-3', name: 'c', nics: { nic: [] } },
        ],
      },
    })

    const vms = await listNetworkVms('net-01')

    expect(vms.map((vm) => vm.id)).toEqual(['vm-1'])
    // one vnicprofiles read + one follow=nics read, nothing per-VM
    const paths = fetchMock.mock.calls.map(([url]) =>
      (url as string).replace('/ovirt-engine/api', ''),
    )
    expect(paths).toEqual(['/networks/net-01/vnicprofiles', '/vms?follow=nics'])
  })

  it('short-circuits without reading /vms when the network has no vNIC profiles', async () => {
    const fetchMock = routedFetch({
      // empty-list key omission → zero profiles
      '/networks/net-empty/vnicprofiles': {},
    })

    await expect(listNetworkVms('net-empty')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('listNetworkTemplates', () => {
  it('keeps templates whose NIC uses a vNIC profile on this network', async () => {
    routedFetch({
      '/networks/net-01/vnicprofiles': { vnic_profile: [{ id: 'vnic-02', name: 'prod' }] },
      '/templates?follow=nics': {
        template: [
          {
            id: 't-1',
            name: 'tpl',
            description: 'd',
            nics: { nic: [{ id: 't-1-nic0', vnic_profile: { id: 'vnic-02' } }] },
          },
          {
            id: 't-2',
            name: 'x',
            nics: { nic: [{ id: 't-2-nic0', vnic_profile: { id: 'zzz' } }] },
          },
        ],
      },
    })

    const templates = await listNetworkTemplates('net-01')

    expect(templates.map((t) => t.id)).toEqual(['t-1'])
    expect(templates[0].description).toBe('d')
  })
})

describe('updateNetwork', () => {
  it('PUTs the changed fields to /networks/{id} and parses the read model back', async () => {
    const fetchMock = routedFetch({ '/networks/net-01': { id: 'net-01', name: 'edited' } })
    const net = await updateNetwork('net-01', { name: 'edited' })
    // routedFetch's stub declares only (url); the transport still calls it with
    // (url, init), and vi.fn records both — cast through unknown to read init.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/networks/net-01')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'edited' })
    expect(net.name).toBe('edited')
  })
})

describe('deleteNetwork', () => {
  it('DELETEs /networks/{id} with no body', async () => {
    const fetchMock = routedFetch({ '/networks/net-01': {} })
    await expect(deleteNetwork('net-01')).resolves.toBeUndefined()
    // routedFetch's stub declares only (url); the transport still calls it with
    // (url, init), and vi.fn records both — cast through unknown to read init.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/networks/net-01')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })
})
