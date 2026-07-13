import { z } from 'zod'
import { ApiError, request } from '../transport'

// A VM's virtual NUMA node as GET /vms/{id}/numanodes returns it. The wire type
// is api-model VirtualNumaNode, which extends NumaNode (index / memory /
// cpu.cores.core[].index — same shape resources/hostNuma.ts reads) and adds the
// vNUMA-only numa_node_pins. The live engine serializes numeric scalars as JSON
// strings, so every number coerces both forms (see CLAUDE.md). Kept inline —
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
// degrade to [] rather than error (CLAUDE.md live-engine hygiene). The host
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

// Editing pins (VmNumaNodeService.Update — PUT /vms/{id}/numanodes/{nodeId} with
// a vm_numa_node body carrying numa_node_pins[].index) IS cleanly modeled in the
// api-model. It is deliberately NOT surfaced here: this module backs the host
// NUMA tab's read-only cross-VM join view, and vNUMA pin authoring belongs in
// the VM Edit dialog's NUMA-pinning section (webadmin parity — the topology is
// edited whole, against a powered-off VM), not the host topology tab. Left as a
// documented divergence so a future VM-edit surface can add the write fn here.
