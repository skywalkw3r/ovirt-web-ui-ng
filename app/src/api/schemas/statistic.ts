import { z } from 'zod'

// GET /vms/{id}/statistics entry — see legacy Transforms.VmStatistics
// (ovirtapi/transform.js): each gauge carries its samples in
// values.value[n].datum, and the live engine serializes the numeric datum as
// a JSON string. Host statistics share the exact wire shape, so HostSchema
// reuses VmStatSchema for its ?follow=statistics inline.
export const VmStatSchema = z.looseObject({
  id: z.string(),
  // dotted metric name, e.g. 'cpu.current.guest' or 'memory.usage'
  name: z.string().optional(),
  values: z
    .looseObject({
      // Numeric gauges carry `datum` (the live engine serializes it as a string,
      // so coerce). String-typed stats — notably `disks.usage`, a JSON array of
      // {path,total,used,fs} — instead carry an UNcoerced `detail` string (see
      // legacy Transforms.VmStatistics transform.js:387; verified on a live 4.5
      // engine). Keep `detail` a plain string; callers JSON.parse it.
      value: z
        .array(
          z.looseObject({ datum: z.coerce.number().optional(), detail: z.string().optional() }),
        )
        .optional(),
    })
    .optional(),
})

// JSON quirk: the "statistic" key is omitted when the list is empty.
export const VmStatListSchema = z.looseObject({
  statistic: z.array(VmStatSchema).optional(),
})

export type VmStat = z.infer<typeof VmStatSchema>
