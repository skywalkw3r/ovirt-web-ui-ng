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
const SSO_SCOPE = 'ovirt-app-api'

// Sign-out revocation. NOT /ovirt-engine/sso/oauth/revoke: that servlet
// authenticates the CLIENT (OAuthRevokeServlet → getClientIdClientSecret throws
// invalid_request when client_id/client_secret are absent), and a browser SPA
// has no client secret to send — every call from here came back
// `400 {"error":"invalid_request","error_description":"Missing parameter:
// 'client_id'"}`, which the old code discarded, so sign-out silently left the
// token live server-side until it expired on its own.
// /services/sso-logout is the engine's own token-scoped alias — it takes
// scope + token and authenticates the caller BY the token being revoked, which
// is exactly what both the Go and Python oVirt SDKs use. Verified against a
// live 4.5 engine: 200 {}.
const SSO_LOGOUT_PATH = '/ovirt-engine/services/sso-logout'

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

// Kills the token server-side at sign-out. The client-side token is gone
// regardless, so this never throws — but it DOES report, because a silent
// failure here is the difference between "signed out" and "still signed in
// from anyone holding the token". Returns false when the engine did not
// confirm the revoke, so the caller can say so out loud.
//
// oVirt reports SSO failures in the BODY (`{"error": ...}`), sometimes under a
// 200 — the SDKs check the payload, not the status, and so must we: HTTP-ok
// alone is not evidence of revocation. Success is `{}`.
//
// keepalive:true so clicking Sign out and immediately closing the tab still
// lands the revoke; a plain fetch is cancelled on unload.
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${getActiveBase()}${SSO_LOGOUT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ scope: SSO_SCOPE, token }),
      keepalive: true,
    })
    const payload: unknown = await response.json().catch(() => undefined)
    const error = SsoErrorSchema.safeParse(payload)
    if (!response.ok || (error.success && error.data.error !== undefined)) {
      console.warn(
        'SSO token revoke was not confirmed by the engine — the token may stay valid until it expires server-side.',
        { status: response.status, error: error.success ? error.data.error : undefined },
      )
      return false
    }
    return true
  } catch {
    // Offline / engine unreachable. Nothing actionable beyond the local clear
    // the caller already did; the token dies with its own expiry.
    console.warn('SSO token revoke could not reach the engine; token cleared locally only.')
    return false
  }
}
