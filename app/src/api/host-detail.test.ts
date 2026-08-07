import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  commitHostNetConfig,
  getHost,
  listHostAffinityLabels,
  listHostDevices,
  listHostErrata,
  listHostHooks,
  listHostNetworkAttachments,
  listHostNics,
  listHostPermissions,
  setupHostNetworks,
} from './resources/hosts'
import { listEvents } from './resources/events'
import { listVms } from './resources/vms'
import { mockRequest, resetMockVms } from './mock/handlers'
import { clearSessionToken, setSessionToken } from './session'

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

describe('getHost', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('GETs /hosts/{id} and coerces the extended scalars', async () => {
    const fetchMock = mockFetch(200, {
      id: 'host-01',
      name: 'node-01',
      status: 'up',
      memory: '274877906944',
      max_scheduling_memory: '257698037760',
      cluster: { id: 'cluster-01', name: 'Default' },
      spm: { priority: '5', status: { state: 'spm' } },
      ksm: { enabled: 'true' },
      transparent_hugepages: { enabled: true },
      se_linux: { mode: 'enforcing' },
      cpu: {
        name: 'Intel Xeon',
        type: 'Secure Intel Icelake Server Family',
        speed: '2000',
        topology: { sockets: 1, cores: '8', threads: 2 },
      },
      hosted_engine: { active: 'true', score: '3400', configured: true },
      summary: { active: '5', migrating: '0', total: 6 },
    })

    const host = await getHost('host-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/hosts/host-01?all_content=true&follow=cluster',
    )
    expect(host.memory).toBe(274877906944)
    expect(host.max_scheduling_memory).toBe(257698037760)
    expect(host.cluster?.name).toBe('Default')
    expect(host.spm?.priority).toBe(5)
    expect(host.spm?.status).toEqual({ state: 'spm' })
    expect(host.ksm?.enabled).toBe(true)
    expect(host.transparent_hugepages?.enabled).toBe(true)
    expect(host.se_linux?.mode).toBe('enforcing')
    expect(host.cpu?.type).toBe('Secure Intel Icelake Server Family')
    expect(host.cpu?.speed).toBe(2000)
    expect(host.cpu?.topology?.cores).toBe(8)
    expect(host.hosted_engine?.active).toBe(true)
    expect(host.hosted_engine?.score).toBe(3400)
    expect(host.summary?.active).toBe(5)
    expect(host.summary?.migrating).toBe(0)
    expect(host.summary?.total).toBe(6)
  })

  it('encodes the host id in the path', async () => {
    const fetchMock = mockFetch(200, { id: 'a/b', name: 'weird' })
    await getHost('a/b')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/hosts/a%2Fb?all_content=true&follow=cluster',
    )
  })
})

describe('host subcollections', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listHostNics parses the bond/base-interface shape and coerces speed', async () => {
    const fetchMock = mockFetch(200, {
      host_nic: [
        {
          id: 'nic-bond0',
          name: 'bond0',
          mac: { address: '3c:ec:ef:1a:2b:01' },
          ip: { address: '10.0.0.11', netmask: '255.255.255.0', gateway: '10.0.0.1' },
          status: 'up',
          speed: '10000000000',
          bonding: { options: {} },
        },
        { id: 'nic-eno1', name: 'eno1', speed: 10000000000, base_interface: 'bond0' },
      ],
    })

    const nics = await listHostNics('host-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/hosts/host-01/nics')
    expect(nics[0].speed).toBe(10000000000)
    expect(nics[0].ip?.address).toBe('10.0.0.11')
    expect(nics[1].base_interface).toBe('bond0')
  })

  it('listHostDevices accepts vendor/product as objects or bare strings', async () => {
    const fetchMock = mockFetch(200, {
      host_device: [
        {
          id: 'dev-1',
          name: 'pci_0000_00_00_0',
          capability: 'pci',
          vendor: { name: 'Intel Corporation' },
          product: { name: 'Ice Lake' },
        },
        { id: 'dev-2', name: 'pci_0000_04_00_0', vendor: 'Samsung', product: 'PM9A1' },
      ],
    })

    const devices = await listHostDevices('host-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/hosts/host-01/devices')
    expect(devices[0].vendor).toEqual({ name: 'Intel Corporation' })
    expect(devices[1].vendor).toBe('Samsung')
  })

  it('listHostPermissions parses role name and coerces string administrative', async () => {
    const fetchMock = mockFetch(200, {
      permission: [{ id: 'p-1', role: { name: 'SuperUser', administrative: 'true' } }],
    })

    const permissions = await listHostPermissions('host-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/hosts/host-01/permissions?follow=role',
    )
    expect(permissions[0].role?.name).toBe('SuperUser')
    expect(permissions[0].role?.administrative).toBe(true)
  })

  it('listHostNics handles the empty-list quirk (missing "host_nic" key)', async () => {
    mockFetch(200, {})
    await expect(listHostNics('host-01')).resolves.toEqual([])
  })
})

describe('setup networks wire contract', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listHostNetworkAttachments follows network and coerces string in_sync', async () => {
    const fetchMock = mockFetch(200, {
      network_attachment: [
        {
          id: 'att-1',
          network: { id: 'net-01', name: 'ovirtmgmt' },
          host_nic: { id: 'nic-1' },
          in_sync: 'false',
          ip_address_assignments: {
            ip_address_assignment: [
              { assignment_method: 'static', ip: { address: '10.0.0.11', version: 'v4' } },
            ],
          },
        },
      ],
    })

    const attachments = await listHostNetworkAttachments('host-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/hosts/host-01/networkattachments?follow=network',
    )
    expect(attachments[0].network?.name).toBe('ovirtmgmt')
    expect(attachments[0].in_sync).toBe(false)
    expect(attachments[0].ip_address_assignments?.ip_address_assignment?.[0].ip?.address).toBe(
      '10.0.0.11',
    )
  })

  it('listHostNetworkAttachments handles the empty-list quirk (missing key)', async () => {
    mockFetch(200, {})
    await expect(listHostNetworkAttachments('host-01')).resolves.toEqual([])
  })

  it('setupHostNetworks builds the static-IP attach payload with the defaults', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          networkId: 'net-02',
          nicName: 'eno2',
          bootProtocol: 'static',
          ipChanged: true,
          ip: { address: '10.1.0.5', netmask: '255.255.255.0', gateway: '10.1.0.1' },
        },
      ],
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/hosts/host-01/setupnetworks')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      check_connectivity: true,
      commit_on_success: true,
      modified_network_attachments: {
        network_attachment: [
          {
            network: { id: 'net-02' },
            host_nic: { name: 'eno2' },
            ip_address_assignments: {
              ip_address_assignment: [
                {
                  assignment_method: 'static',
                  ip: {
                    address: '10.1.0.5',
                    netmask: '255.255.255.0',
                    gateway: '10.1.0.1',
                    version: 'v4',
                  },
                },
              ],
            },
          },
        ],
      },
    })
  })

  it('setupHostNetworks carries attachment ids, removals, syncs and the overrides', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-01',
          nicName: 'eno1',
          bootProtocol: 'dhcp',
          ipChanged: true,
        },
      ],
      removed: ['att-2'],
      synced: ['att-3'],
      checkConnectivity: false,
      connectivityTimeout: 120,
      commitOnSuccess: false,
    })

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      check_connectivity: false,
      connectivity_timeout: 120,
      commit_on_success: false,
      modified_network_attachments: {
        network_attachment: [
          {
            id: 'att-1',
            network: { id: 'net-01' },
            host_nic: { name: 'eno1' },
            ip_address_assignments: {
              ip_address_assignment: [{ assignment_method: 'dhcp' }],
            },
          },
        ],
      },
      removed_network_attachments: { network_attachment: [{ id: 'att-2' }] },
      synchronized_network_attachments: { network_attachment: [{ id: 'att-3' }] },
    })
  })

  it('omits ip_address_assignments on a move-only edit so the engine keeps existing IP config', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      // moved to a new NIC, IP untouched (ipChanged false) → no assignment
      // block, so the engine preserves the attachment's IpConfiguration
      // (including any IPv6 a lone IPv4 assignment would otherwise wipe)
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-01',
          nicName: 'eno3',
          bootProtocol: 'static',
          ipChanged: false,
          ip: { address: '10.0.0.5', netmask: '255.255.255.0' },
        },
      ],
    })
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    const entry = body.modified_network_attachments.network_attachment[0]
    expect(entry).toEqual({ id: 'att-1', network: { id: 'net-01' }, host_nic: { name: 'eno3' } })
    expect(entry.ip_address_assignments).toBeUndefined()
  })

  it('commitHostNetConfig POSTs an empty action body', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await commitHostNetConfig('host-01')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/hosts/host-01/commitnetconfig')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({})
  })
})

describe('host optional subcollections (404-tolerant)', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('listHostHooks resolves empty on a 404 subcollection', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listHostHooks('host-01')).resolves.toEqual([])
  })

  it('listHostHooks rethrows non-404 errors', async () => {
    mockFetch(500, { fault: { reason: 'Internal Server Error' } })
    await expect(listHostHooks('host-01')).rejects.toMatchObject({ status: 500 })
  })

  it('listHostAffinityLabels resolves empty on a 404 subcollection', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listHostAffinityLabels('host-01')).resolves.toEqual([])
  })

  it('listHostErrata resolves empty on a 404 (no Satellite integration)', async () => {
    mockFetch(404, { fault: { reason: 'Not Found' } })
    await expect(listHostErrata('host-01')).resolves.toEqual([])
  })

  it('listHostErrata rethrows non-404 errors', async () => {
    mockFetch(503, { fault: { reason: 'Service Unavailable' } })
    await expect(listHostErrata('host-01')).rejects.toMatchObject({ status: 503 })
  })
})

describe('event search passthrough', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('appends the search term (host.name=<name>) to the request path', async () => {
    const fetchMock = mockFetch(200, {})
    await listEvents({ search: 'host.name=node-01' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/ovirt-engine/api/events?max=100&search=host.name%3Dnode-01',
    )
  })

  it('omits the search param when none is given', async () => {
    const fetchMock = mockFetch(200, {})
    await listEvents()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ovirt-engine/api/events?max=100')
  })
})

describe('mock host detail (through the mock engine)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
    resetMockVms()
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  // Settle the mock latency timer without reaching the multi-second
  // state-transition timers.
  async function call<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  it('getHost parses node-01 with all the enriched fields', async () => {
    const host = await call(getHost('host-01'))
    expect(host.name).toBe('node-01')
    expect(host.cpu?.type).toBe('Secure Intel Icelake Server Family')
    expect(host.cpu?.topology?.cores).toBe(8)
    expect(host.hosted_engine?.score).toBe(3400)
    expect(host.hosted_engine?.active).toBe(true)
    expect(host.se_linux?.mode).toBe('enforcing')
    expect(host.spm?.priority).toBe(5)
    expect(host.hardware_information?.product_name).toBe('PowerEdge R650')
  })

  it('serves node-01 nics including a bond, its member, and free NICs', async () => {
    const nics = await call(listHostNics('host-01'))
    // eno2/eno3 are the free (unbonded, unattached) NICs the Setup Networks
    // bond editor demos with — see the handlers.ts fixture
    expect(nics.map((n) => n.name)).toEqual(['bond0', 'eno1', 'eno2', 'eno3'])
    expect(nics[0].bonding).toBeDefined()
    expect(nics[1].base_interface).toBe('bond0')
    // string speed rides in the bond fixture; the schema coerces it
    expect(nics[0].speed).toBe(10 * 1000 ** 3)
  })

  it('serves pci devices with mixed vendor/product shapes', async () => {
    const devices = await call(listHostDevices('host-01'))
    expect(devices.length).toBeGreaterThanOrEqual(3)
    expect(devices.some((d) => typeof d.vendor === 'string')).toBe(true)
    expect(devices.some((d) => typeof d.vendor === 'object')).toBe(true)
  })

  it('serves one registered hook on node-01', async () => {
    const hooks = await call(listHostHooks('host-01'))
    expect(hooks).toHaveLength(1)
    expect(hooks[0].event_name).toBe('before_vm_start')
  })

  it('serves a SuperUser admin permission', async () => {
    const permissions = await call(listHostPermissions('host-01'))
    expect(permissions).toHaveLength(1)
    expect(permissions[0].role?.name).toBe('SuperUser')
    expect(permissions[0].role?.administrative).toBe(true)
  })

  it('serves empty affinity labels and errata', async () => {
    await expect(call(listHostAffinityLabels('host-01'))).resolves.toEqual([])
    await expect(call(listHostErrata('host-01'))).resolves.toEqual([])
  })

  it('answers 404 for an unknown host id', async () => {
    const promise = mockRequest('/hosts/nope', { method: 'GET' })
    const rejection = expect(promise).rejects.toMatchObject({ status: 404 })
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })

  it('filters VMs by host.name through the search DSL', async () => {
    const vms = await call(listVms({ search: 'host.name=node-01' }))
    // vm-01 (web-01), vm-03 (db-01) and vm-he (HostedEngine) run on host-01
    // in the fixtures
    expect(vms.map((v) => v.name).sort()).toEqual(['HostedEngine', 'db-01', 'web-01'])
  })

  it('filters events by host.name through the search DSL', async () => {
    // `host` is a loose passthrough key on the event schema (not a declared
    // field), so read it off the parsed object explicitly.
    const events = (await call(listEvents({ search: 'host.name=node-01' }))) as Array<{
      host?: { name?: string }
    }>
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events.every((e) => e.host?.name === 'node-01')).toBe(true)
  })
})

describe('mock setup networks (through the mock engine)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_MOCK', '1')
    setSessionToken('tok-123')
    resetMockVms()
  })
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  // Settle the mock latency timer without reaching the multi-second
  // state-transition timers.
  async function call<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function rejects(promise: Promise<unknown>, status: number): Promise<void> {
    const rejection = expect(promise).rejects.toMatchObject({ status })
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  }

  it('serves node-01 attachments with the network inlined and string in_sync coerced', async () => {
    const attachments = await call(listHostNetworkAttachments('host-01'))
    expect(attachments.map((a) => a.network?.name)).toEqual(['ovirtmgmt', 'storage'])
    expect(attachments[0].in_sync).toBe(true)
    // string 'false' in the fixture exercises the stringbool path
    expect(attachments[1].in_sync).toBe(false)
    expect(attachments[0].host_nic?.name).toBe('bond0')
  })

  it('serves the empty-list quirk for a host with no attachments', async () => {
    await expect(call(listHostNetworkAttachments('host-02'))).resolves.toEqual([])
  })

  it('attaches a network to a NIC (happy path) with a deterministic id', async () => {
    await call(
      setupHostNetworks('host-01', {
        modified: [
          { networkId: 'net-02', nicName: 'bond0', bootProtocol: 'dhcp', ipChanged: true },
        ],
      }),
    )
    const attachments = await call(listHostNetworkAttachments('host-01'))
    const added = attachments.find((a) => a.network?.id === 'net-02')
    expect(added).toMatchObject({
      id: 'host-01-att-1',
      network: { id: 'net-02', name: 'vm-prod' },
      host_nic: { name: 'bond0' },
      in_sync: true,
    })
    expect(added?.ip_address_assignments?.ip_address_assignment?.[0].assignment_method).toBe('dhcp')
  })

  it('detaches a non-management attachment by id', async () => {
    await call(setupHostNetworks('host-01', { removed: ['host-01-att-storage'] }))
    const attachments = await call(listHostNetworkAttachments('host-01'))
    expect(attachments.map((a) => a.network?.name)).toEqual(['ovirtmgmt'])
  })

  it('re-IPs an existing attachment and reflects the static address on the NIC', async () => {
    await call(
      setupHostNetworks('host-01', {
        modified: [
          {
            attachmentId: 'host-01-att-mgmt',
            networkId: 'net-01',
            nicName: 'bond0',
            bootProtocol: 'static',
            ipChanged: true,
            ip: { address: '10.0.0.42', netmask: '255.255.255.0', gateway: '10.0.0.1' },
          },
        ],
      }),
    )
    const attachments = await call(listHostNetworkAttachments('host-01'))
    const mgmt = attachments.find((a) => a.id === 'host-01-att-mgmt')
    expect(mgmt?.ip_address_assignments?.ip_address_assignment?.[0].ip?.address).toBe('10.0.0.42')
    // no duplicate attachment was created for the reused id
    expect(attachments).toHaveLength(2)
    const nics = await call(listHostNics('host-01'))
    expect(nics.find((n) => n.name === 'bond0')?.ip?.address).toBe('10.0.0.42')
  })

  it('flips in_sync on a synchronized attachment', async () => {
    await call(setupHostNetworks('host-01', { synced: ['host-01-att-storage'] }))
    const attachments = await call(listHostNetworkAttachments('host-01'))
    expect(attachments.find((a) => a.id === 'host-01-att-storage')?.in_sync).toBe(true)
  })

  it('409s when the management network would be fully detached — and applies nothing', async () => {
    await rejects(setupHostNetworks('host-01', { removed: ['host-01-att-mgmt'] }), 409)
    const attachments = await call(listHostNetworkAttachments('host-01'))
    expect(attachments.map((a) => a.network?.name)).toContain('ovirtmgmt')
  })

  it('allows moving the management network to another NIC in the same action', async () => {
    await call(
      setupHostNetworks('host-01', {
        removed: ['host-01-att-mgmt'],
        modified: [
          {
            attachmentId: 'host-01-att-mgmt',
            networkId: 'net-01',
            nicName: 'eno1',
            bootProtocol: 'dhcp',
            ipChanged: false,
          },
        ],
      }),
    )
    const attachments = await call(listHostNetworkAttachments('host-01'))
    expect(attachments.find((a) => a.network?.id === 'net-01')?.host_nic?.name).toBe('eno1')
  })

  it('400s a modified entry missing the host_nic reference', async () => {
    const body = {
      modified_network_attachments: { network_attachment: [{ network: { id: 'net-02' } }] },
    }
    await rejects(mockRequest('/hosts/host-01/setupnetworks', { method: 'POST', body }), 400)
  })

  it('404s an attachment reference the host does not have', async () => {
    await rejects(setupHostNetworks('host-01', { removed: ['nope'] }), 404)
  })

  it('commitnetconfig answers the action envelope as a no-op', async () => {
    await expect(call(commitHostNetConfig('host-01'))).resolves.toBeUndefined()
  })
})
