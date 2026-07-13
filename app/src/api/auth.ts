import { z } from 'zod'
import { getActiveBase } from '../servers/registry'

// Login: oVirt SSO's http grant exchanges Basic credentials for an API token
// (same flow legacy/scripts/start.js uses). Used in dev, and in production by
// the login form — both for the same-origin engine and for any configured
// external engine (multi-engine). An engine-served page may instead arrive
// already authenticated via the injected window.userInfo session (see
// auth/bootstrap.ts), which always belongs to the same-origin engine.
// External engines must allow this origin on their SSO endpoints (CORS): a
// fixed enginesso build or the packaging/engine-cors/ Apache drop-in.
const SSO_TOKEN_PATH =
  '/ovirt-engine/sso/oauth/token?grant_type=urn:ovirt:params:oauth:grant-type:http&scope=ovirt-app-api'
const SSO_REVOKE_PATH = '/ovirt-engine/sso/oauth/revoke'

const TokenResponseSchema = z.looseObject({ access_token: z.string() })
const SsoErrorSchema = z.looseObject({
  error: z.string().optional(),
  error_description: z.string().optional(),
})

export class AuthenticationError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AuthenticationError'
    this.status = status
  }
}

export async function obtainToken(username: string, password: string): Promise<string> {
  // Dev-only mock mode: any credentials sign in (see api/mock/handlers.ts).
  // The username feeds the mock's capability tier ('admin*' → admin).
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK === '1') {
    const { setMockUsername } = await import('./mock/handlers')
    setMockUsername(username)
    return 'mock-token'
  }

  const response = await fetch(`${getActiveBase()}${SSO_TOKEN_PATH}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    },
  })

  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    const parsed = SsoErrorSchema.safeParse(payload)
    const description = parsed.success
      ? (parsed.data.error_description ?? parsed.data.error)
      : undefined
    throw new AuthenticationError(response.status, description ?? 'Login failed')
  }

  const token = TokenResponseSchema.safeParse(payload)
  if (!token.success) {
    throw new AuthenticationError(response.status, 'SSO returned an unexpected token payload')
  }
  return token.data.access_token
}

// Best-effort RFC 7009 revocation; the in-memory token is gone regardless,
// this just shortens its server-side lifetime. Never throws.
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${getActiveBase()}${SSO_REVOKE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    })
  } catch {
    // token still cleared client-side; nothing actionable
  }
}
