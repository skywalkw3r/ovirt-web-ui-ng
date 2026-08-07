import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupHostNetworks } from '../../api/resources/hosts'
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
