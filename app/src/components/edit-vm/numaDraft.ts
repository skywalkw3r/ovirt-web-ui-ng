import type { HostNumaNode } from '../../api/resources/hostNuma'
import {
  pinnedHostNodeIndices,
  vmNumaNodeCpuIndices,
  type VmNumaNode,
  type VmNumaStep,
} from '../../api/resources/vmNuma'
import type { MessageId } from '../../i18n/messages/en'
import {
  draftHasSpecificHost,
  draftVcpuCount,
  isExclusivePinningPolicy,
  type DraftError,
} from './cpuPinning'
import type { EditVmDraft } from './editVmDraft'

// Virtual NUMA for the Edit VM dialog: the node list the Host section edits,
// webadmin's default vCPU/memory distribution, the engine's topology rules and
// the ordered REST plan a save runs. Pure functions only, unit-tested in
// numaDraft.test.ts.
//
// The topology lives in the /vms/{id}/numanodes subcollection, not on the vm
// read or the vm PUT body (Vm.numaNodes is a link; the REST mapper never reads
// nodes from an update), so the modal seeds it separately (numaDraftFields) and
// saves it through its own calls (buildNumaPlan), like the watchdog device.

// One virtual NUMA node as the draft holds it. id '' marks a node that does not
// exist on the engine yet; such a node has no vCPUs / memory of its own until
// resolveNumaNodes distributes them.
export interface NumaNodeDraft {
  id: string
  index: number
  cpuIds: number[]
  memoryMb: number
  tuneMode: string
  pins: number[]
}

// The engine's VmNumaNode.DEFAULT_NUMA_TUNE: what a node without an explicit
// mode gets (AbstractVmNumaNodeCommand.getEffectiveNumaTune).
export const DEFAULT_NUMA_TUNE_MODE = 'interleave'

// api-model types/NumaTuneMode. Since engine 4.4.5 the mode is per virtual node
// (the VM-level numa_tune_mode is deprecated), which is where webadmin's NUMA
// pinning dialog edits it too.
export const NUMA_TUNE_MODE_OPTIONS: { value: string; labelId: MessageId }[] = [
  { value: 'interleave', labelId: 'vm.edit.numa.tune.interleave' },
  { value: 'strict', labelId: 'vm.edit.numa.tune.strict' },
  { value: 'preferred', labelId: 'vm.edit.numa.tune.preferred' },
]

// The draft fields for the loaded numanodes collection, in index order (the
// api-model: "The order of the returned list of NUMA nodes isn't guaranteed").
export function numaDraftFields(nodes: VmNumaNode[]): Pick<EditVmDraft, 'numaLoaded' | 'numaNodes'> {
  return {
    numaLoaded: true,
    numaNodes: nodes
      .map((node, position) => ({
        id: node.id ?? '',
        index: node.index ?? position,
        cpuIds: vmNumaNodeCpuIndices(node),
        memoryMb: node.memory ?? 0,
        tuneMode: node.numa_tune_mode ?? DEFAULT_NUMA_TUNE_MODE,
        pins: pinnedHostNodeIndices(node),
      }))
      .sort((a, b) => a.index - b.index),
  }
}

// The baseline once a vNUMA step ran: the nodes the engine now holds.
export function baselineWithNuma(baseline: EditVmDraft, nodes: VmNumaNode[]): EditVmDraft {
  return { ...baseline, ...numaDraftFields(nodes) }
}

// `count` brand-new nodes. Webadmin drops the existing nodes (and their pins)
// whenever the count changes (NumaUnitToVmBaseBuilder: a node list whose size
// differs from the count is rebuilt from empty VmNumaNodes), so a count change
// starts from unpinned default-tuned nodes here too.
export function freshNumaNodes(count: number): NumaNodeDraft[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    id: '',
    index,
    cpuIds: [],
    memoryMb: 0,
    tuneMode: DEFAULT_NUMA_TUNE_MODE,
    pins: [],
  }))
}

// The hugepage size (KiB) from the `hugepages` custom property, when set to a
// number. Node memory must be a multiple of it (NumaValidator
// .checkHugepagesFitNumaNodes), so the distribution rounds to it.
export function draftHugepagesKb(draft: Pick<EditVmDraft, 'customProperties'>): number | undefined {
  const value = draft.customProperties.find((row) => row.name.trim() === 'hugepages')?.value
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined
  const size = Number(value.trim())
  return size > 0 ? size : undefined
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// Webadmin's default distribution of vCPUs and memory over the virtual nodes: a
// line-for-line port of the engine's NumaUtils.setNumaListConfiguration, which
// NumaUnitToVmBaseBuilder runs on every Edit VM save. vCPUs are handed out in
// contiguous blocks rounded up to whole cores (threadsPerCore), the last node
// taking the rest. Memory follows the vCPU share when it divides evenly per
// vCPU, and is otherwise (or under an exclusive pinning policy) split equally
// with the remainder blocks going to the first nodes. A block is 1 MiB, or the
// hugepage size when the VM uses hugepages.
export function distributeNuma(input: {
  nodeCount: number
  memoryMb: number
  vcpuCount: number
  threadsPerCore: number
  exclusive: boolean
  hugepagesKb?: number
}): { cpuIds: number[]; memoryMb: number }[] {
  const { nodeCount, memoryMb, vcpuCount, exclusive } = input
  if (nodeCount <= 0 || vcpuCount <= 0) return []
  const threadsPerCore = Math.max(1, input.threadsPerCore)

  const granularityKb = input.hugepagesKb ?? 1024
  const granularityMb = (granularityKb * 1024) / gcd(granularityKb, 1024) / 1024
  const blocks = Math.floor(memoryMb / granularityMb)
  const blocksPerCpu = Math.floor(blocks / vcpuCount)
  const hasRemainderBlocks = blocks % vcpuCount !== 0
  const blocksPerNode = Math.floor(blocks / nodeCount)
  let remainingBlocks = blocks % nodeCount

  const nodes: { cpuIds: number[]; memoryMb: number }[] = []
  let nextCpuId = 0
  let nodesLeft = nodeCount
  for (let position = 0; position < nodeCount; position += 1) {
    const cpusPerNode = Math.floor((vcpuCount - nextCpuId) / nodesLeft)
    nodesLeft -= 1
    const threadRemainder = cpusPerNode % threadsPerCore
    let nodeCpus = cpusPerNode
    if (nodesLeft !== 0 && threadRemainder !== 0) nodeCpus += threadsPerCore - threadRemainder

    let nodeMemoryMb: number
    if (hasRemainderBlocks || exclusive) {
      nodeMemoryMb = (blocksPerNode + (remainingBlocks > 0 ? 1 : 0)) * granularityMb
      remainingBlocks -= 1
    } else {
      nodeMemoryMb = blocksPerCpu * nodeCpus * granularityMb
    }

    const cpuIds: number[] = []
    for (let cpu = 0; cpu < nodeCpus; cpu += 1) {
      cpuIds.push(nextCpuId)
      nextCpuId += 1
    }
    nodes.push({ cpuIds, memoryMb: nodeMemoryMb })
  }
  return nodes
}

// Everything the distribution reads off the draft.
function distributionInputs(draft: EditVmDraft) {
  return {
    memoryMb: draft.memoryMb,
    vcpuCount: draftVcpuCount(draft),
    threadsPerCore: draft.threadsPerCore,
    exclusive: isExclusivePinningPolicy(draft.cpuPinningPolicy),
    hugepagesKb: draftHugepagesKb(draft),
  }
}

// Structural compare (plain scalars / arrays built by one code path).
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// The node list a save would leave on the engine. Webadmin recomputes every
// node's vCPUs and memory on each save; here that only happens when something
// the distribution depends on moved (the node count, the vCPU topology, the
// memory size, an exclusive pinning policy, the hugepage size), so opening and
// saving an unrelated field never rewrites a topology that was laid out by hand
// over REST. Tune modes and pins are always the draft's own.
export function resolveNumaNodes(draft: EditVmDraft, baseline: EditVmDraft): NumaNodeDraft[] {
  const nodes = [...draft.numaNodes].sort((a, b) => a.index - b.index)
  const redistribute =
    nodes.length !== baseline.numaNodes.length ||
    nodes.some((node) => node.id === '') ||
    !same(distributionInputs(draft), distributionInputs(baseline))
  if (!redistribute) return nodes
  const shares = distributeNuma({ nodeCount: nodes.length, ...distributionInputs(draft) })
  return nodes.map((node, index) => ({
    ...node,
    index,
    cpuIds: shares[index]?.cpuIds ?? [],
    memoryMb: shares[index]?.memoryMb ?? 0,
  }))
}

// A pinned host's physical NUMA topology, for the compatibility rules.
export interface PlacementHostNuma {
  name: string
  nodes: HostNumaNode[]
}

// Validate the vNUMA topology the way the engine does on every numanodes call
// and on the vm update (NumaValidator.checkVmNumaNodesIntegrity, plus the two
// policy rules webadmin enforces), so the user sees why a save would bounce:
//   - `preferred` only works on a single node pinned to a single host node
//   - no more nodes than vCPUs
//   - pinning a node needs the VM pinned to at least one host
//   - a dedicated / isolate-threads policy excludes pinned nodes (webadmin
//     disables both policies then; the engine rejects Dedicated)
//   - every host the VM is pinned to must have a NUMA topology (more than one
//     node), must have each pinned node index, and under `strict` a node's
//     memory must fit the host node it is pinned to
// The vCPU and memory sums always hold for a distributed topology and are left
// to the engine for a hand-laid one. `hosts` are the pinned hosts whose NUMA
// read has landed; the host rules only cover those. Nothing is checked under
// Resize and Pin NUMA, where the engine owns the topology. Returns undefined
// when valid.
export function numaError(
  draft: EditVmDraft,
  baseline: EditVmDraft,
  hosts: PlacementHostNuma[] = [],
): DraftError | undefined {
  if (!draft.numaLoaded || draft.cpuPinningPolicy === 'resize_and_pin_numa') return undefined
  const nodes = resolveNumaNodes(draft, baseline)
  if (nodes.length === 0) return undefined

  const pinned = nodes.some((node) => node.pins.length > 0)
  if (
    nodes.some((node) => node.tuneMode === 'preferred') &&
    !(nodes.length === 1 && nodes[0].pins.length === 1)
  ) {
    return { id: 'vm.edit.numa.error.preferred' }
  }
  const vcpus = draftVcpuCount(draft)
  if (nodes.length > vcpus) {
    return { id: 'vm.edit.numa.error.tooManyNodes', values: { count: nodes.length, cpus: vcpus } }
  }
  const specificHost = draftHasSpecificHost(draft)
  if (pinned && !specificHost) return { id: 'vm.edit.numa.error.pinsNeedHost' }
  if (pinned && isExclusivePinningPolicy(draft.cpuPinningPolicy)) {
    return { id: 'vm.edit.numa.error.pinsWithDedicated' }
  }
  if (!specificHost) return undefined

  for (const host of hosts) {
    if (host.nodes.length < 2) {
      return { id: 'vm.edit.numa.error.hostUnsupported', values: { host: host.name } }
    }
    for (const node of nodes) {
      for (const pin of node.pins) {
        const hostNode = host.nodes.find((candidate) => candidate.index === pin)
        if (hostNode === undefined) {
          return {
            id: 'vm.edit.numa.error.hostNodeMissing',
            values: { hostNode: pin, host: host.name },
          }
        }
        if (node.tuneMode === 'strict' && node.memoryMb > (hostNode.memory ?? Infinity)) {
          return {
            id: 'vm.edit.numa.error.memory',
            values: { node: node.index, hostNode: pin, host: host.name },
          }
        }
      }
    }
  }
  return undefined
}

// The REST calls a save must send for the vNUMA topology, split around the vm
// PUT, or undefined when nothing moved (or the nodes were never read, or the
// policy hands the topology to the engine).
export interface NumaPlan {
  beforeVm: VmNumaStep[]
  afterVm: VmNumaStep[]
}

// The vm fields the engine validates the vNUMA topology against, on both the
// numanodes calls and the vm update (which re-checks the stored nodes against
// the updated VM: UpdateVmCommand.validate).
function numaRelevantVmChange(draft: EditVmDraft, baseline: EditVmDraft): boolean {
  return (
    !same(distributionInputs(draft), distributionInputs(baseline)) ||
    draft.cpuPinningPolicy !== baseline.cpuPinningPolicy ||
    draft.startRunningOn !== baseline.startRunningOn ||
    !same(draft.placementHostIds, baseline.placementHostIds)
  )
}

function specOf(node: NumaNodeDraft) {
  return {
    index: node.index,
    memoryMb: node.memoryMb,
    cpuIds: node.cpuIds,
    tuneMode: node.tuneMode,
    pins: node.pins,
  }
}

// Order matters because the engine validates the whole topology after every
// single call, and validates the stored topology again on the vm PUT:
//   - Only tune modes / pins moved, and nothing the topology is validated
//     against: update those nodes in place after the vm PUT.
//   - Otherwise the topology is rebuilt: remove every node (highest index
//     first, as the api-model requires) and add the new ones in index order, so
//     every intermediate state is a valid prefix. When the same save also moves
//     a vm field the topology is validated against (vCPUs, memory, pinned
//     hosts, pinning policy), the removals go BEFORE the vm PUT and the adds
//     after it: the old nodes may not fit the new VM and the new nodes may not
//     fit the old one. A fault between the two leaves the VM without vNUMA
//     nodes until the save is retried (the modal says so).
// REST has no single call that swaps the topology atomically the way
// webadmin's UpdateVm does (its nodes ride the command parameters).
export function buildNumaPlan(draft: EditVmDraft, baseline: EditVmDraft): NumaPlan | undefined {
  if (!draft.numaLoaded || !baseline.numaLoaded) return undefined
  if (draft.cpuPinningPolicy === 'resize_and_pin_numa') return undefined
  const target = resolveNumaNodes(draft, baseline)
  const current = [...baseline.numaNodes].sort((a, b) => a.index - b.index)
  if (same(target.map(specOf), current.map(specOf))) return undefined

  const relevantVmChange = numaRelevantVmChange(draft, baseline)
  const sameShape =
    target.length === current.length &&
    target.every(
      (node, position) =>
        node.index === current[position].index &&
        same(node.cpuIds, current[position].cpuIds) &&
        node.memoryMb === current[position].memoryMb,
    )
  if (sameShape && !relevantVmChange) {
    return {
      beforeVm: [],
      afterVm: target
        .map((node, position) => ({ node, loaded: current[position] }))
        .filter(({ node, loaded }) => !same(specOf(node), specOf(loaded)))
        .map(({ node, loaded }) => ({
          kind: 'update' as const,
          nodeId: loaded.id,
          tuneMode: node.tuneMode,
          pins: node.pins,
        })),
    }
  }

  const removals: VmNumaStep[] = [...current]
    .reverse()
    .map((node) => ({ kind: 'remove' as const, nodeId: node.id }))
  const adds: VmNumaStep[] = target.map((node) => ({ kind: 'add' as const, node: specOf(node) }))
  return relevantVmChange
    ? { beforeVm: removals, afterVm: adds }
    : { beforeVm: [], afterVm: [...removals, ...adds] }
}

// Compact "0-3, 6" rendering of a node's vCPU ids for the node table.
export function formatCpuIds(cpuIds: number[]): string {
  const sorted = [...cpuIds].sort((a, b) => a - b)
  const parts: string[] = []
  let start = 0
  while (start < sorted.length) {
    let end = start
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1
    parts.push(end === start ? String(sorted[start]) : `${sorted[start]}-${sorted[end]}`)
    start = end + 1
  }
  return parts.join(', ')
}
