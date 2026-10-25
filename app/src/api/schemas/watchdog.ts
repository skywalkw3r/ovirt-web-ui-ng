import { z } from 'zod'

// A VM watchdog device (GET /vms/{id}/watchdogs). Verified against
// ovirt-engine-api-model types/Watchdog (extends Device): `model` is the
// WatchdogModel enum (i6300esb on x86_64/ppc64, diag288 on s390x) and `action`
// the WatchdogAction enum (none/reset/poweroff/pause/dump), both lowercase on
// the wire. Kept loose strings so an unmodeled enum value survives a
// round-trip instead of failing the whole read.
export const WatchdogSchema = z.looseObject({
  id: z.string(),
  model: z.string().optional(),
  action: z.string().optional(),
})

// JSON quirk (same family as nics/sessions): the collection wrapper omits the
// "watchdog" key entirely when the VM has no watchdog device.
export const WatchdogListSchema = z.looseObject({
  watchdog: z.array(WatchdogSchema).optional(),
})

export type Watchdog = z.infer<typeof WatchdogSchema>
