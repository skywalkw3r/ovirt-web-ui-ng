import { z } from 'zod'

// Installed guest packages the guest agent reports. Only id is guaranteed; the
// name is the human-readable package string (e.g. 'kernel-5.14.0-427.el9').
export const VmApplicationSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
})

// JSON quirk: GET /vms/{id}/applications omits the "application" key entirely
// when the guest agent reports nothing (or is absent).
export const VmApplicationListSchema = z.looseObject({
  application: z.array(VmApplicationSchema).optional(),
})

export type VmApplication = z.infer<typeof VmApplicationSchema>
