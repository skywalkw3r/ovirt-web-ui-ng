import { ApiError } from '../../transport'
import { hostNetworkAttachments, hostNics, hosts } from '../handlers'
import type { MockRoute } from './types'

// Fixture reads go through the handlers module's live bindings, and only
// inside handle() (never at module evaluation): handlers.ts imports this
// module via ./routes, so the bindings are initialized by the time a request
// is served but not while this file evaluates.

// LLDP TLVs per host NIC id (GET .../linklayerdiscoveryprotocolelements).
// node-01's eno1 (a bond0 member) and eno2 report a typical switch-port set,
// integers mixed string/number to exercise the schema coercion; eno3 and the
// bond master report nothing (the "no LLDP data reported" state). Shapes follow
// the api-model LinkLayerDiscoveryProtocolElement examples.
const LLDP_BY_NIC: Record<string, unknown[]> = {
  'host-01-nic-eno1': [
    {
      name: 'Chassis ID',
      type: '1',
      properties: {
        property: [
          { name: 'chassis ID', value: '00:1c:73:aa:bb:01' },
          { name: 'chassis ID subtype', value: 'MAC' },
        ],
      },
    },
    {
      name: 'Port ID',
      type: 2,
      properties: {
        property: [
          { name: 'port ID', value: 'Ethernet1/7' },
          { name: 'port ID subtype', value: 'Interface Name' },
        ],
      },
    },
    { name: 'Time To Live', type: '3', properties: { property: [{ name: 'TTL', value: '120' }] } },
    {
      name: 'System Name',
      type: '5',
      properties: { property: [{ name: 'system name', value: 'tor-sw-01.lab.local' }] },
    },
    {
      name: 'Port VLAN Id',
      type: '127',
      oui: '32962',
      subtype: 1,
      properties: { property: [{ name: 'Port VLAN Identifier', value: '1' }] },
    },
  ],
  'host-01-nic-eno2': [
    {
      name: 'Chassis ID',
      type: 1,
      properties: {
        property: [
          { name: 'chassis ID', value: '00:1c:73:aa:bb:02' },
          { name: 'chassis ID subtype', value: 'MAC' },
        ],
      },
    },
    {
      name: 'Port Description',
      type: '4',
      properties: { property: [{ name: 'port description', value: 'Summit300-48-Port 1001' }] },
    },
    {
      name: 'Port VLAN Id',
      type: 127,
      oui: '32962',
      subtype: '3',
      properties: {
        property: [
          { name: 'vlan id', value: '488' },
          { name: 'vlan name', value: 'v2-0488-03-0505' },
        ],
      },
    },
  ],
}

// Statuses in which VDSM answers the engine's live LLDP query. Anything else
// (non_responsive, down, installing, ...) faults like an unreachable host.
const LLDP_REACHABLE = new Set(['up', 'maintenance', 'non_operational'])

// HostValidator.LEGAL_STATUSES for the internal HostSetupNetworks a copy runs.
const SETUP_NETWORKS_LEGAL = new Set(['up', 'maintenance', 'non_operational'])

function hostById(id: string) {
  const host = hosts.find((candidate) => candidate.id === id)
  if (!host) throw new ApiError(404, 'Not Found', `no host with id ${id}`)
  return host
}

// The engine's noBondAndVlanPredicate (fixture NICs carry no vlan key, so a
// bond master is the only exclusion). The engine also leaves the management
// interface out on both sides; the mock skips that refinement.
function physicalNicCount(hostId: string): number {
  return (hostNics.get(hostId) ?? []).filter((nic) => nic.bonding === undefined).length
}

// Mock routes for the host and host-network area (LLDP, copy host networks, local storage). Checked before the
// core table in handlers.ts, so an entry here can also narrow an existing path.
export const hostNetworkRoutes: MockRoute[] = [
  {
    method: 'GET',
    pattern: /^\/hosts\/([^/]+)\/nics\/([^/]+)\/linklayerdiscoveryprotocolelements$/,
    handle: ([hostId, nicId]) => {
      const host = hostById(hostId)
      if (!(hostNics.get(hostId) ?? []).some((nic) => nic.id === nicId)) {
        throw new ApiError(404, 'Not Found', `host ${hostId} has no NIC ${nicId}`)
      }
      if (!LLDP_REACHABLE.has(host.status ?? '')) {
        throw new ApiError(
          409,
          'Operation Failed',
          `Cannot get LLDP information. Host ${host.name} is not reachable (status ${host.status ?? 'unknown'}).`,
        )
      }
      const elements = LLDP_BY_NIC[nicId] ?? []
      // empty-list quirk: the collection key is omitted entirely
      return elements.length > 0 ? { link_layer_discovery_protocol_element: elements } : {}
    },
  },
  {
    // POST /hosts/{id}/copyhostnetworks: CopyHostNetworksCommand.validate()
    // order: both hosts exist, same cluster, enough interfaces; then the
    // internal HostSetupNetworks' status check. On success the destination's
    // attachments become the source's, re-pointed at the destination NIC of
    // the same name (the engine pairs by name ORDER and also rebuilds bonds;
    // the mock keeps to attachments, dropping any whose NIC name is absent).
    method: 'POST',
    pattern: /^\/hosts\/([^/]+)\/copyhostnetworks$/,
    handle: ([hostId], body) => {
      const sourceId = (body as { source_host?: { id?: string } } | undefined)?.source_host?.id
      if (!sourceId) {
        throw new ApiError(
          400,
          'Incomplete parameters',
          'Action [sourceHost.id] required for copyHostNetworks',
        )
      }
      const destination = hostById(hostId)
      const source = hosts.find((candidate) => candidate.id === sourceId)
      if (!source) {
        throw new ApiError(409, 'Operation Failed', 'The selected Host does not exist.')
      }
      if (source.cluster?.id !== destination.cluster?.id) {
        throw new ApiError(
          409,
          'Operation Failed',
          'Cannot copy networks to Host. Hosts are not in the same cluster.',
        )
      }
      if (physicalNicCount(sourceId) > physicalNicCount(hostId)) {
        throw new ApiError(
          409,
          'Operation Failed',
          'Cannot copy networks to Host. Interface count of destination host has to be at least as high as that of the source host.',
        )
      }
      if (!SETUP_NETWORKS_LEGAL.has(destination.status ?? '')) {
        throw new ApiError(
          409,
          'Operation Failed',
          'Cannot copy networks to Host. Operation can be performed only when Host status is Maintenance, Up, NonOperational.',
        )
      }
      const destinationNics = hostNics.get(hostId) ?? []
      const copied = (hostNetworkAttachments.get(sourceId) ?? []).flatMap((attachment, index) => {
        const nic = destinationNics.find(
          (candidate) => candidate.name === attachment.host_nic?.name,
        )
        if (!nic) return []
        return [
          {
            ...structuredClone(attachment),
            id: `${hostId}-att-copy-${index}`,
            host_nic: { id: nic.id, name: nic.name },
          },
        ]
      })
      hostNetworkAttachments.set(hostId, copied)
      return { status: 'complete' }
    },
  },
]
