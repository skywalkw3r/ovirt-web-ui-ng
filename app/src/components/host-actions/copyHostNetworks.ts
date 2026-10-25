import { isPhysicalHostNic, type HostNic } from '../../api/schemas/host-nic'
import type { Host } from '../../api/schemas/host'

// The hosts a copy may read from: same cluster (CopyHostNetworksCommand
// rejects anything else with HOSTS_NOT_IN_SAME_CLUSTER), never the destination
// itself, sorted by name for the picker.
export function copySourceCandidates(host: Host, hosts: Host[]): Host[] {
  const clusterId = host.cluster?.id
  if (!clusterId) return []
  return hosts
    .filter((candidate) => candidate.id !== host.id && candidate.cluster?.id === clusterId)
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
}

// Physical (non-bond, non-VLAN) interface count, the quantity the engine
// compares. The engine additionally leaves the management interface out on
// both sides, which this client-side count cannot replicate exactly (it
// depends on how management is wired on each host), so a mismatch here is a
// warning, not a hard block: the engine stays the arbiter and its fault
// surfaces verbatim.
export function physicalNicCount(nics: HostNic[]): number {
  return nics.filter(isPhysicalHostNic).length
}
