import { z } from 'zod'

// The engine-injected SSO session (see src/global.d.ts). Only ssoToken and
// userName are load-bearing for us — the rest of window.userInfo (domain,
// userId, sessionAgeInSec) is ignored here. A token must be a non-empty
// string; a blank one means "no session" (legacy/src/index.js treats an empty
// token as "Missing SSO Token").
const InjectedUserInfoSchema = z.looseObject({
  ssoToken: z.string().min(1),
  userName: z.string().min(1),
})

export interface InjectedSession {
  token: string
  username: string
}

// Reads window.userInfo, injected by the engine's SSO-authenticated page.
// Returns the seeded session when present and well-shaped, or null when the
// global is absent/blank/malformed (dev, mock, or a page the engine did not
// bootstrap) so callers fall through to the login form.
export function readInjectedSession(): InjectedSession | null {
  const parsed = InjectedUserInfoSchema.safeParse(window.userInfo)
  if (!parsed.success) return null
  return { token: parsed.data.ssoToken, username: parsed.data.userName }
}
