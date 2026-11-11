import { z } from 'zod'
import { ApiError, request } from '../transport'

// A VM's virtual NUMA node as GET /vms/{id}/numanodes returns it. The wire type
// is api-model VirtualNumaNode, which extends NumaNode (index / memory /
// cpu.cores.core[].index — same shape resources/hostNuma.ts reads) and adds the
// vNUMA-only numa_node_pins. The live engine serializes numeric scalars as JSON
// strings, so every number coerces both forms (see CONTRIBUTING.md). Kept inline —
// only this module and the host NUMA tab consume it.
//
// memory is reported in MB, not bytes (NumaNode: "Memory of the NUMA node in
// MB"); the NUMA tab converts before formatting.

// A NumaNodePin (api-model types/NumaNodePin): `index` is the index of the
// physical (host) NUMA node this virtual node is pinned to. `pinned` and
// `host_numa_node` are api-model-deprecated ("Has no function" / "Should always
// be true"), so we read `index` only; looseObject keeps the deprecated keys off
// the type without dropping them from the payload.
export const NumaNodePinSchema = z.looseObject({
  index: z.coerce.number().optional(),
})

// numaNodePins serializes as { numa_node_pins: { numa_node_pin: [...] } } — the
// engine's list convention (mirrors cpu.cores.core). The wrapper/key are omitted
// when a vNUMA node carries no pins.
export const VmNumaNodeSchema = z.looseObject({
  id: z.string().optional(),
  index: z.coerce.number().optional(),
  // MB, not bytes — the NUMA tab converts before formatting.
  memory: z.coerce.number().optional(),
  cpu: z
    .looseObject({
      cores: z
        .looseObject({
          core: z.array(z.looseObject({ index: z.coerce.number().optional() })).optional(),
        })
        .optional(),
    })
    .optional(),
  numa_node_pins: z
    .looseObject({
      numa_node_pin: z.array(NumaNodePinSchema).optional(),
    })
    .optional(),
  // api-model NumaTuneMode (strict | interleave | preferred), per virtual node.
  // The VM-level vm.numa_tune_mode is api-model-deprecated "in favor of NUMA
  // tune per vNUMA node", so the per-node value is the one read and written.
  numa_tune_mode: z.string().optional(),
})

// JSON quirk: the "vm_numa_node" key is omitted when the list is empty (mirror
// HostNumaNodeListSchema). VirtualNumaNode serializes under the vm_numa_node
// element, distinct from the host side's host_numa_node.
export const VmNumaNodeListSchema = z.looseObject({
  vm_numa_node: z.array(VmNumaNodeSchema).optional(),
})

export type VmNumaNode = z.infer<typeof VmNumaNodeSchema>

// GET /vms/{id}/numanodes → the VM's virtual NUMA topology (VmNumaNodesService.
// List, verified against ovirt-engine-api-model). A VM with no vNUMA topology
// answers with an empty collection (key omitted), normalized to []. An engine or
// VM that lacks the subcollection answers 404 — an optional subcollection, so
// degrade to [] rather than error (CONTRIBUTING.md live-engine hygiene). The host
// NUMA tab joins these against the host's physical nodes client-side.
export async function listVmNumaNodes(id: string): Promise<VmNumaNode[]> {
  try {
    const data = VmNumaNodeListSchema.parse(
      await request(`/vms/${encodeURIComponent(id)}/numanodes`),
    )
    return data.vm_numa_node ?? []
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return []
    throw error
  }
}

// The physical (host) NUMA node indices a virtual NUMA node is pinned to. The
// api-model models numa_node_pins as a list, so a vNUMA node can in principle
// pin to several physical nodes; return every pinned index (sorted, deduped).
export function pinnedHostNodeIndices(node: VmNumaNode): number[] {
  const indices = (node.numa_node_pins?.numa_node_pin ?? [])
    .map((pin) => pin.index)
    .filter((index): index is number => index !== undefined)
  return [...new Set(indices)].sort((a, b) => a - b)
}

// The logical vCPU ids assigned to a virtual NUMA node are its cpu.cores[].index
// values (same shape as the host side). Sorted for a stable display order.
export function vmNumaNodeCpuIndices(node: VmNumaNode): number[] {
  return (node.cpu?.cores?.core ?? [])
    .map((core) => core.index)
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b)
}

// The vNUMA write surface, verified against ovirt-engine-api-model
// services/VmNumaNodesService + VmNumaNodeService:
//   POST   /vms/{id}/numanodes           Add (index, memory and
//                                        cpu.cores[].index mandatory;
//                                        numa_node_pins[].index and
//                                        numa_tune_mode optional)
//   PUT    /vms/{id}/numanodes/{nodeId}  Update (every field optional)
//   DELETE /vms/{id}/numanodes/{nodeId}  Remove ("remove the numa nodes from
//                                        the highest index first")
// The engine re-validates the WHOLE resulting topology on every call
// (AbstractVmNumaNodeCommand.validate, NumaValidator.checkVmNumaNodesIntegrity:
// contiguous indices from 0, no vCPU in two nodes, total node memory within the
// VM memory, `preferred` only on a single node pinned to a single host node),
// so the order of a multi-call edit matters. applyVmNumaSteps runs a
// caller-ordered plan; the Edit VM dialog builds it (edit-vm/numaDraft.ts).
// The host NUMA tab stays read-only: the topology is edited from the VM.

// One virtual NUMA node as the write calls send it. memoryMb is MB (NumaNode:
// "Memory of the NUMA node in MB"), tuneMode an api-model NumaTuneMode value,
// pins the physical (host) NUMA node indices.
export interface VmNumaNodeSpec {
  index: number
  memoryMb: number
  cpuIds: number[]
  tuneMode: string
  pins: number[]
}

function numaNodesPath(vmId: string): string {
  return `/vms/${encodeURIComponent(vmId)}/numanodes`
}

// numa_node_pins always rides, also when empty: the engine's NumaMapper only
// rewrites a node's pin list when the element is set, so a present-but-empty
// list is what unpins a node on Update (mapper source-verified; the empty-list
// form is UNVERIFIED against a live engine).
function pinsBody(pins: number[]): Record<string, unknown> {
  return { numa_node_pin: pins.map((index) => ({ index })) }
}

// The full vm_numa_node body for Add. An unpinned node leaves numa_node_pins
// out entirely (a new node starts unpinned), so only a re-pin on Update relies
// on the empty-list form.
export function vmNumaNodeBody(spec: VmNumaNodeSpec): Record<string, unknown> {
  return {
    index: spec.index,
    memory: spec.memoryMb,
    cpu: { cores: { core: spec.cpuIds.map((index) => ({ index })) } },
    numa_tune_mode: spec.tuneMode,
    ...(spec.pins.length > 0 ? { numa_node_pins: pinsBody(spec.pins) } : {}),
  }
}

// Add a virtual NUMA node. The response echoes the created node (with its id).
export async function addVmNumaNode(vmId: string, spec: VmNumaNodeSpec): Promise<VmNumaNode> {
  return VmNumaNodeSchema.parse(
    await request(numaNodesPath(vmId), { method: 'POST', body: vmNumaNodeBody(spec) }),
  )
}

// Re-tune / re-pin a virtual NUMA node in place. Only the tune mode and the
// pins ride, so the node keeps its index, vCPUs and memory (the mapper applies
// each element only when it is set).
export async function updateVmNumaNodePinning(
  vmId: string,
  nodeId: string,
  change: Pick<VmNumaNodeSpec, 'tuneMode' | 'pins'>,
): Promise<void> {
  await request(`${numaNodesPath(vmId)}/${encodeURIComponent(nodeId)}`, {
    method: 'PUT',
    body: { numa_tune_mode: change.tuneMode, numa_node_pins: pinsBody(change.pins) },
  })
}

// Remove a virtual NUMA node. A 404 means it is already gone, which is what a
// retry after a half-applied edit meets, so it counts as removed.
export async function removeVmNumaNode(vmId: string, nodeId: string): Promise<void> {
  try {
    await request(`${numaNodesPath(vmId)}/${encodeURIComponent(nodeId)}`, { method: 'DELETE' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return
    throw error
  }
}

// One call of a vNUMA edit, in the order the caller wants them sent.
export type VmNumaStep =
  | { kind: 'remove'; nodeId: string }
  | { kind: 'update'; nodeId: string; tuneMode: string; pins: number[] }
  | { kind: 'add'; node: VmNumaNodeSpec }

// Run the steps strictly one after another (each call is validated against the
// topology the previous one left) and stop at the first fault.
export async function applyVmNumaSteps(vmId: string, steps: VmNumaStep[]): Promise<void> {
  for (const step of steps) {
    if (step.kind === 'remove') {
      await removeVmNumaNode(vmId, step.nodeId)
    } else if (step.kind === 'update') {
      await updateVmNumaNodePinning(vmId, step.nodeId, step)
    } else {
      await addVmNumaNode(vmId, step.node)
    }
  }
}
