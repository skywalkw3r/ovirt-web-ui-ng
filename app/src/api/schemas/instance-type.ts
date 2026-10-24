import { z } from 'zod'

// InstanceType extends Template (which extends VmBase), so it carries the full
// VM hardware surface — but the real dialog edits a lean subset. These are the
// exact field shapes VmSchema uses (memory in bytes; memory_policy, cpu.topology
// and high_availability the same), because an instance type serializes them the
// same way a VM does. OS is deliberately omitted: per the oVirt Instance Types
// design doc it is NOT an instance-type field (it comes from the image instead).
//
// The live engine serializes numeric/boolean scalars as JSON strings
// ("memory": "2147483648"), so every scalar is coerced — never assume a number
// arrives as one (see schemas/vm.ts).
export const InstanceTypeSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // bytes on the wire; edited in MiB in the modal
  memory: z.coerce.number().optional(),
  memory_policy: z
    .looseObject({
      guaranteed: z.coerce.number().optional(),
      max: z.coerce.number().optional(),
    })
    .optional(),
  cpu: z
    .looseObject({
      topology: z
        .looseObject({
          sockets: z.coerce.number().optional(),
          cores: z.coerce.number().optional(),
          threads: z.coerce.number().optional(),
        })
        .optional(),
    })
    .optional(),
  high_availability: z
    .looseObject({
      enabled: z.union([z.boolean(), z.stringbool()]).optional(),
      priority: z.coerce.number().optional(),
    })
    .optional(),
})

// JSON quirk: GET /instancetypes returns { instance_type: [...] } and omits the
// "instance_type" key entirely when the list is empty.
export const InstanceTypeListSchema = z.looseObject({
  instance_type: z.array(InstanceTypeSchema).optional(),
})

export type InstanceType = z.infer<typeof InstanceTypeSchema>
