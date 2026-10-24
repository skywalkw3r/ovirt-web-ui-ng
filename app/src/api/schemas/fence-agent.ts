import { z } from 'zod'

// A host fence agent (GET /hosts/{id}/fenceagents/{agentId}). Fence agents live
// in their own sub-collection — the host resource never carries them (the host
// PUT/POST ignore fencing agents entirely; REST clients CRUD them here).
//
// SECURITY: there is deliberately NO `password` field on this READ model. The
// engine never serializes the fence-agent password back on a GET, so modeling
// it would only invite caching a secret we must never hold. The password rides
// write-only, in the create/update request body alone (see resources/hosts.ts
// FenceAgentSpec).
//
// The live engine serializes scalars as JSON strings, so numbers coerce and
// booleans accept the string form — same rule as the host schema's PM flags.
export const FenceAgentSchema = z.looseObject({
  id: z.string().optional(),
  // fence type, e.g. 'ipmilan', 'drac7', 'apc' — an open string (the engine's
  // agent catalog is deployment-dependent, so no enum)
  type: z.string().optional(),
  address: z.string().optional(),
  username: z.string().optional(),
  // agent evaluation order among a host's agents (1-based); string on the wire
  order: z.coerce.number().optional(),
  // fence device management port; string on the wire, absent for many agents
  port: z.coerce.number().optional(),
  // agent-specific SSL/encryption toggle; string boolean on the wire
  encrypt_options: z.union([z.boolean(), z.stringbool()]).optional(),
  // free-form agent options as name/value pairs (fence_ipmilan lanplus, etc.)
  options: z
    .looseObject({
      option: z
        .array(
          z.looseObject({
            name: z.string().optional(),
            value: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  // whether this agent fences concurrently with the next in order; string bool
  concurrent: z.union([z.boolean(), z.stringbool()]).optional(),
})

// JSON quirk: the "agent" key is omitted when the list is empty.
export const FenceAgentListSchema = z.looseObject({
  agent: z.array(FenceAgentSchema).optional(),
})

export type FenceAgent = z.infer<typeof FenceAgentSchema>
