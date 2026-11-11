import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchNetworkCustomPropertyDefinitions,
  listHostNetworkAttachments,
  parseCustomPropertyDefinitions,
  setupHostNetworks,
} from '../../api/resources/hosts'
import { resetMockVms } from '../../api/mock/handlers'
import { ApiError } from '../../api/transport'
import { clearSessionToken, setSessionToken } from '../../api/session'

// Transport-level fetch stub (same pattern as api/resources/hosts.test.ts) —
// exercises setupHostNetworks without the mock engine so the exact
// setupnetworks request body (bonds / IPv6 dual-stack / DNS resolver) is
// asserted. Owned by Job 1 (host-network/**); the fn itself lives in
// resources/hosts.ts.
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

function sentBody(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(init.body as string) as Record<string, unknown>
}

describe('setupHostNetworks wire mapping', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('POSTs the connectivity/commit defaults and nothing else when the spec is empty', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', { checkConnectivity: true, commitOnSuccess: true })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/ovirt-engine/api/hosts/host-01/setupnetworks')
    expect(init.method).toBe('POST')
    expect(sentBody(fetchMock)).toEqual({ check_connectivity: true, commit_on_success: true })
  })

  it('emits both v4 and v6 assignments for a dual-stack static modify', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-1',
          nicName: 'bond0',
          bootProtocol: 'static',
          ip: { address: '10.0.0.5', netmask: '255.255.255.0', gateway: '10.0.0.1' },
          ipv6BootProtocol: 'static',
          ipv6: { address: '2001:db8::5', netmask: '64', gateway: '2001:db8::1' },
          ipChanged: true,
        },
      ],
    })

    const body = sentBody(fetchMock) as {
      modified_network_attachments: {
        network_attachment: {
          id: string
          host_nic: { name: string }
          ip_address_assignments: { ip_address_assignment: unknown[] }
        }[]
      }
    }
    const attachment = body.modified_network_attachments.network_attachment[0]
    expect(attachment.id).toBe('att-1')
    expect(attachment.host_nic).toEqual({ name: 'bond0' })
    expect(attachment.ip_address_assignments.ip_address_assignment).toEqual([
      {
        assignment_method: 'static',
        ip: { address: '10.0.0.5', netmask: '255.255.255.0', gateway: '10.0.0.1', version: 'v4' },
      },
      {
        assignment_method: 'static',
        ip: { address: '2001:db8::5', netmask: '64', gateway: '2001:db8::1', version: 'v6' },
      },
    ])
  })

  it('omits ip_address_assignments on a move-only modify (ipChanged false)', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-1',
          nicName: 'eno2',
          bootProtocol: 'static',
          ipv6BootProtocol: 'none',
          ipChanged: false,
        },
      ],
    })

    const attachment = (
      sentBody(fetchMock) as {
        modified_network_attachments: { network_attachment: Record<string, unknown>[] }
      }
    ).modified_network_attachments.network_attachment[0]
    expect(attachment.ip_address_assignments).toBeUndefined()
    expect(attachment).toMatchObject({ network: { id: 'net-1' }, host_nic: { name: 'eno2' } })
  })

  it('stamps dns_resolver_configuration.name_servers onto a modified attachment', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-1',
          nicName: 'bond0',
          bootProtocol: 'static',
          ipv6BootProtocol: 'none',
          ipChanged: false,
          nameServers: ['8.8.8.8', '2001:4860:4860::8888'],
        },
      ],
    })

    const attachment = (
      sentBody(fetchMock) as {
        modified_network_attachments: { network_attachment: Record<string, unknown>[] }
      }
    ).modified_network_attachments.network_attachment[0]
    expect(attachment.dns_resolver_configuration).toEqual({
      name_servers: ['8.8.8.8', '2001:4860:4860::8888'],
    })
  })

  it('maps modifiedBonds into modified_bonds with mode/miimon options and slaves', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modifiedBonds: [{ name: 'bond1', mode: 4, slaveNicIds: ['nic-a', 'nic-b'] }],
    })

    const body = sentBody(fetchMock) as {
      modified_bonds: { host_nic: Record<string, unknown>[] }
    }
    expect(body.modified_bonds.host_nic[0]).toEqual({
      name: 'bond1',
      bonding: {
        options: {
          option: [
            { name: 'mode', value: '4' },
            { name: 'miimon', value: '100' },
          ],
        },
        slaves: { host_nic: [{ id: 'nic-a' }, { id: 'nic-b' }] },
      },
    })
    // a fresh bond carries no id (addressed by name)
    expect(body.modified_bonds.host_nic[0]).not.toHaveProperty('id')
  })

  it('carries the engine id when editing an existing bond', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modifiedBonds: [{ id: 'nic-bond1', name: 'bond1', mode: 1, slaveNicIds: ['nic-a', 'nic-b'] }],
    })

    const body = sentBody(fetchMock) as {
      modified_bonds: { host_nic: Record<string, unknown>[] }
    }
    expect(body.modified_bonds.host_nic[0].id).toBe('nic-bond1')
  })

  it('maps removedBonds into removed_bonds by id or name', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      removedBonds: [{ id: 'nic-bond1', name: 'bond1' }, { name: 'bond2' }],
    })

    const body = sentBody(fetchMock) as {
      removed_bonds: { host_nic: Record<string, unknown>[] }
    }
    expect(body.removed_bonds.host_nic).toEqual([{ id: 'nic-bond1' }, { name: 'bond2' }])
  })

  it('maps removed and synchronized attachment ids to their wrapped lists', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', { removed: ['att-1'], synced: ['att-2'] })

    const body = sentBody(fetchMock) as {
      removed_network_attachments: { network_attachment: { id: string }[] }
      synchronized_network_attachments: { network_attachment: { id: string }[] }
    }
    expect(body.removed_network_attachments.network_attachment).toEqual([{ id: 'att-1' }])
    expect(body.synchronized_network_attachments.network_attachment).toEqual([{ id: 'att-2' }])
  })

  it('emits an inline host-network qos block on an override modify', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-1',
          nicName: 'eno2',
          bootProtocol: 'none',
          ipv6BootProtocol: 'none',
          ipChanged: false,
          qos: { linkshare: 50, upperlimit: 1000, realtime: 200 },
        },
      ],
    })

    const attachment = (
      sentBody(fetchMock) as {
        modified_network_attachments: { network_attachment: Record<string, unknown>[] }
      }
    ).modified_network_attachments.network_attachment[0]
    // type='hostnetwork' is required so QosMapper builds a HostNetworkQos
    expect(attachment.qos).toEqual({
      type: 'hostnetwork',
      outbound_average_linkshare: 50,
      outbound_average_upperlimit: 1000,
      outbound_average_realtime: 200,
    })
  })

  it('emits a bare type=hostnetwork qos when clearing an override', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-1',
          nicName: 'eno2',
          bootProtocol: 'none',
          ipv6BootProtocol: 'none',
          ipChanged: false,
          qos: {},
        },
      ],
    })

    const attachment = (
      sentBody(fetchMock) as {
        modified_network_attachments: { network_attachment: Record<string, unknown>[] }
      }
    ).modified_network_attachments.network_attachment[0]
    expect(attachment.qos).toEqual({ type: 'hostnetwork' })
  })

  it('emits custom properties as the wrapped properties.property list', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modified: [
        {
          attachmentId: 'att-1',
          networkId: 'net-1',
          nicName: 'eno2',
          bootProtocol: 'none',
          ipv6BootProtocol: 'none',
          ipChanged: false,
          properties: [
            { name: 'bridge_opts', value: 'forward_delay=1500 multicast_snooping=1' },
            { name: 'ethtool_opts', value: '--offload em1 rx on' },
          ],
        },
      ],
    })

    const attachment = (
      sentBody(fetchMock) as {
        modified_network_attachments: { network_attachment: Record<string, unknown>[] }
      }
    ).modified_network_attachments.network_attachment[0]
    expect(attachment.properties).toEqual({
      property: [
        { name: 'bridge_opts', value: 'forward_delay=1500 multicast_snooping=1' },
        { name: 'ethtool_opts', value: '--offload em1 rx on' },
      ],
    })
    // a properties-only modify touches neither the IP config nor the QoS
    expect(attachment.ip_address_assignments).toBeUndefined()
    expect(attachment.qos).toBeUndefined()
  })

  it('keeps the properties key present (empty list) to clear them, and omits it otherwise', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    const base = {
      networkId: 'net-1',
      nicName: 'eno2',
      bootProtocol: 'none' as const,
      ipv6BootProtocol: 'none' as const,
      ipChanged: false,
    }
    await setupHostNetworks('host-01', {
      modified: [
        { ...base, attachmentId: 'att-1', properties: [] },
        { ...base, attachmentId: 'att-2' },
      ],
    })

    const [cleared, untouched] = (
      sentBody(fetchMock) as {
        modified_network_attachments: { network_attachment: Record<string, unknown>[] }
      }
    ).modified_network_attachments.network_attachment
    expect(cleared.properties).toEqual({ property: [] })
    expect('properties' in untouched).toBe(false)
  })

  it('maps modified/removed NIC labels into modified_labels/removed_labels', async () => {
    const fetchMock = mockFetch(200, { status: 'complete' })
    await setupHostNetworks('host-01', {
      modifiedLabels: [{ label: 'red', nicId: 'nic-eno2', nicName: 'eno2' }],
      removedLabels: ['blue'],
    })

    const body = sentBody(fetchMock) as {
      modified_labels: { network_label: Record<string, unknown>[] }
      removed_labels: { network_label: { id: string }[] }
    }
    // a modified label references its target NIC (host_nic id|name)
    expect(body.modified_labels.network_label[0]).toEqual({
      id: 'red',
      host_nic: { id: 'nic-eno2', name: 'eno2' },
    })
    // a removed label is keyed by id alone
    expect(body.removed_labels.network_label).toEqual([{ id: 'blue' }])
  })

  it('surfaces an engine fault as ApiError and keeps it intact', async () => {
    mockFetch(409, {
      fault: { reason: 'Operation Failed', detail: 'Bond mode 4 requires two slaves' },
    })
    const error = await setupHostNetworks('host-01', {
      modifiedBonds: [{ name: 'bond1', mode: 4, slaveNicIds: ['nic-a'] }],
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Bond mode 4 requires two slaves' })
  })
})

describe('network custom property definitions', () => {
  beforeEach(() => setSessionToken('tok-123'))
  afterEach(() => {
    clearSessionToken()
    vi.unstubAllGlobals()
  })

  it('parses key=regex pairs, splitting each on its first equals sign', () => {
    expect(
      parseCustomPropertyDefinitions('bridge_opts=^[^\\s=]+=[^\\s=]+$;ethtool_opts=.*'),
    ).toEqual({ bridge_opts: '^[^\\s=]+=[^\\s=]+$', ethtool_opts: '.*' })
    expect(parseCustomPropertyDefinitions('')).toEqual({})
  })

  it('reads both engine options and takes the row of the cluster level', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            values: {
              system_option_value: url.includes('PreDefined')
                ? [
                    { value: 'bridge_opts=old', version: '4.6' },
                    { value: 'bridge_opts=new', version: '4.7' },
                  ]
                : [
                    { value: '', version: '4.6' },
                    { value: 'ethtool_opts=.*', version: '4.7' },
                  ],
            },
          }),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchNetworkCustomPropertyDefinitions('4.7')).resolves.toEqual({
      bridge_opts: 'new',
      ethtool_opts: '.*',
    })
    await expect(fetchNetworkCustomPropertyDefinitions('4.6')).resolves.toEqual({
      bridge_opts: 'old',
    })
    // version unknown: the newest level the engine reports
    await expect(fetchNetworkCustomPropertyDefinitions()).resolves.toEqual({
      bridge_opts: 'new',
      ethtool_opts: '.*',
    })
    expect(fetchMock.mock.calls.map(([url]) => url as string).slice(0, 2)).toEqual([
      '/ovirt-engine/api/options/PreDefinedNetworkCustomProperties',
      '/ovirt-engine/api/options/UserDefinedNetworkCustomProperties',
    ])
  })

  it('rejects when the engine does not serve the options (free-form fallback)', async () => {
    mockFetch(404, { fault: { reason: 'Not Found', detail: 'no such option' } })
    await expect(fetchNetworkCustomPropertyDefinitions('4.7')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('custom properties through the mock engine', () => {
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

  // Settle the mock latency timer (the api/host-detail.test.ts idiom).
  async function call<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(500)
    return promise
  }

  async function rejects(promise: Promise<unknown>, status: number): Promise<void> {
    const rejection = expect(promise).rejects.toMatchObject({ status })
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  }

  const modify = (attachmentId: string, networkId: string) => ({
    attachmentId,
    networkId,
    nicName: 'bond0',
    bootProtocol: 'none' as const,
    ipChanged: false,
  })

  async function propertiesOf(attachmentId: string) {
    const attachments = await call(listHostNetworkAttachments('host-01'))
    return attachments.find((a) => a.id === attachmentId)?.properties
  }

  it('serves the seeded bridge_opts and the engine key definitions', async () => {
    expect(await propertiesOf('host-01-att-mgmt')).toEqual({
      property: [{ name: 'bridge_opts', value: 'forward_delay=1500 multicast_snooping=1' }],
    })
    // the attachment without properties omits the key, like the live mapper
    expect(await propertiesOf('host-01-att-storage')).toBeUndefined()
    const definitions = await call(fetchNetworkCustomPropertyDefinitions('4.7'))
    expect(Object.keys(definitions)).toEqual(['bridge_opts', 'ethtool_opts'])
  })

  it('round-trips a replaced set, keeps it on an unrelated modify, and clears it', async () => {
    const replaced = [
      { name: 'bridge_opts', value: 'forward_delay=0' },
      { name: 'ethtool_opts', value: '--offload em1 rx on' },
    ]
    await call(
      setupHostNetworks('host-01', {
        modified: [{ ...modify('host-01-att-mgmt', 'net-01'), properties: replaced }],
      }),
    )
    expect(await propertiesOf('host-01-att-mgmt')).toEqual({ property: replaced })

    // a modify that omits properties keeps the stored set
    await call(setupHostNetworks('host-01', { modified: [modify('host-01-att-mgmt', 'net-01')] }))
    expect(await propertiesOf('host-01-att-mgmt')).toEqual({ property: replaced })

    await call(
      setupHostNetworks('host-01', {
        modified: [{ ...modify('host-01-att-mgmt', 'net-01'), properties: [] }],
      }),
    )
    expect(await propertiesOf('host-01-att-mgmt')).toBeUndefined()
  })

  it('409s bad custom properties the way the engine validator does, applying nothing', async () => {
    const attempt = (networkId: string, attachmentId: string, name: string, value: string) =>
      setupHostNetworks('host-01', {
        modified: [{ ...modify(attachmentId, networkId), properties: [{ name, value }] }],
      })
    // bridge_opts on storage, which is not a VM network
    await rejects(attempt('net-03', 'host-01-att-storage', 'bridge_opts', 'forward_delay=0'), 409)
    // a key the engine config does not define
    await rejects(attempt('net-01', 'host-01-att-mgmt', 'no_such_key', 'x'), 409)
    // a value that does not match the key's regex
    await rejects(attempt('net-01', 'host-01-att-mgmt', 'bridge_opts', 'forward_delay'), 409)
    expect(await propertiesOf('host-01-att-storage')).toBeUndefined()
    expect(await propertiesOf('host-01-att-mgmt')).toEqual({
      property: [{ name: 'bridge_opts', value: 'forward_delay=1500 multicast_snooping=1' }],
    })
    // an admin-defined key is fine on a non-VM network
    await call(attempt('net-03', 'host-01-att-storage', 'ethtool_opts', '-K em1 gso off'))
    expect(await propertiesOf('host-01-att-storage')).toEqual({
      property: [{ name: 'ethtool_opts', value: '-K em1 gso off' }],
    })
  })
})
