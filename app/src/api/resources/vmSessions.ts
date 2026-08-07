import { z } from 'zod'
import { request } from '../transport'

// the live engine serializes booleans as strings ("true"/"false")
const BooleanishSchema = z.union([z.boolean(), z.stringbool()])

// GET /vms/{id}/sessions element. Verified against ovirt-engine-api-model
// types/Session:
//   - console_user (Boolean): true for SPICE/VNC console sessions, false for
//     RDP/SSH guest logins. Rides as a JSON string on the live engine.
//   - protocol (String): SPICE/VNC/SSH/RDP. The model notes it is "not yet
//     implemented" on many engines, so it is frequently absent — optional.
//   - ip (Ip): the address the user connects from, "presently available only
//     for console users" — so it is often absent for guest logins.
//   - user (User link): the real oVirt account for console users; for others
//     only the user_name is supplied. Never followed here (a session carries
//     the user_name inline), so id/name may be absent.
export const SessionSchema = z.looseObject({
  id: z.string().optional(),
  console_user: BooleanishSchema.optional(),
  protocol: z.string().optional(),
  ip: z.looseObject({ address: z.string().optional() }).optional(),
  user: z
    .looseObject({
      id: z.string().optional(),
      user_name: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
})

// JSON quirk (same family as snapshots/nics): the collection wrapper omits the
// "session" key entirely when the VM has no active sessions.
export const SessionListSchema = z.looseObject({
  session: z.array(SessionSchema).optional(),
})

export type Session = z.infer<typeof SessionSchema>

// Every open console/guest-login session on the VM. Read-only — the engine
// exposes no per-session actions on this subcollection.
export async function listVmSessions(vmId: string): Promise<Session[]> {
  const data = SessionListSchema.parse(await request(`/vms/${encodeURIComponent(vmId)}/sessions`))
  return data.session ?? []
}
