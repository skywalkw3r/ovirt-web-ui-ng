import { z } from 'zod'

// 'Event' would shadow the DOM type, hence the Ovirt prefix.
export const OvirtEventSchema = z.looseObject({
  id: z.string(),
  // numeric audit-log code; the live engine serializes numeric scalars as
  // JSON strings
  code: z.coerce.number().optional(),
  // 'normal' | 'warning' | 'error' | 'alert' — open string, same rationale
  // as vm status
  severity: z.string().optional(),
  description: z.string().optional(),
  // epoch ms; the live engine serializes numeric scalars as JSON strings
  time: z.coerce.number().optional(),
  vm: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
})

// JSON quirk: the "event" key is omitted when the list is empty.
export const OvirtEventListSchema = z.looseObject({
  event: z.array(OvirtEventSchema).optional(),
})

export type OvirtEvent = z.infer<typeof OvirtEventSchema>
