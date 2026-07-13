import { z } from 'zod'
import { request } from '../transport'

// A host NUMA node as GET /hosts/{id}/numanodes returns it (types/NumaNode).
// The live engine serializes numeric scalars as JSON strings, so every number
// coerces both forms (see CLAUDE.md). Kept inline — only this module and the
// NUMA tab consume it, and it never touches the shared host schema.
//
// memory is reported in MB, not bytes (types/NumaNode: "Memory of the NUMA node
// in MB"). cpu.cores wraps the node's cores in the engine's
// { cores: { core: [...] } } list convention; each core's index is a logical
// CPU id assigned to the node.
export const HostNumaNodeSchema = z.looseObject({
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
})

// JSON quirk: the "host_numa_node" key is omitted when the list is empty
// (mirror HostNicListSchema / HostDeviceListSchema). Verified against the oVirt
// Go SDK writer (XMLNumaNodeWriteMany → "host_numa_nodes"/"host_numa_node").
export const HostNumaNodeListSchema = z.looseObject({
  host_numa_node: z.array(HostNumaNodeSchema).optional(),
})

export type HostNumaNode = z.infer<typeof HostNumaNodeSchema>

// GET /hosts/{id}/numanodes → the host's NUMA topology. Hosts with no NUMA
// topology answer with an empty collection (the key omitted), normalized to [].
export async function listHostNumaNodes(id: string): Promise<HostNumaNode[]> {
  const data = HostNumaNodeListSchema.parse(
    await request(`/hosts/${encodeURIComponent(id)}/numanodes`),
  )
  return data.host_numa_node ?? []
}
