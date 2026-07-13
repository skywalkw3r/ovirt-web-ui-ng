// Session store: the SSO bearer token (+ the username it belongs to), backed
// by sessionStorage so a PAGE REFRESH does not bounce an authenticated user
// back to /login.
//
// This was originally memory-only by design (docs/PLAN.md §1.3). Revisited
// deliberately: sessionStorage is per-tab and dies with it — nothing ever
// lands in localStorage or survives the browsing session — and an XSS payload
// able to enumerate sessionStorage could equally hook fetch and lift the
// token off the wire, so the practical exposure delta is ~nil while the
// refresh-logout was a real, everyday usability failure. The tradeoff is
// recorded in docs/SECURITY.md §3. The token still never appears in URLs,
// localStorage, or the rendered page.
//
// sessionStorage can throw in exotic contexts (Safari lockdown mode, some
// private windows) — every access degrades to memory-only rather than
// breaking auth.
const TOKEN_KEY = 'console-session-token'
const USERNAME_KEY = 'console-session-username'
const TIER_KEY = 'console-session-tier'
const SERVER_KEY = 'console-session-server'

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // memory copy still works for this page's lifetime
  }
}

function storageRemove(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // nothing stored, nothing to remove
  }
}

let token: string | null = storageGet(TOKEN_KEY)

export function setSessionToken(value: string): void {
  token = value
  storageSet(TOKEN_KEY, value)
}

export function getSessionToken(): string | null {
  return token
}

// The username the persisted token belongs to — lets AuthProvider restore an
// authenticated boot after a refresh (same shape as the engine-injected
// session path). Stored beside the token and cleared with it.
export function setSessionUsername(value: string): void {
  storageSet(USERNAME_KEY, value)
}

export function getPersistedUsername(): string | null {
  return storageGet(USERNAME_KEY)
}

// Multi-engine: the fetch base the token belongs to ('' = same-origin, else
// an engine origin — see servers/registry.ts). A token is only ever valid on
// the engine that issued it, so the base is stamped beside the token at login
// and consulted on boot: a refresh-restored session reconnects to ITS engine
// regardless of what the last-picked selection in localStorage says, and a
// token whose engine has vanished from the configured list is discarded
// rather than sent to a different server.
export function setSessionServerBase(base: string): void {
  storageSet(SERVER_KEY, base)
}

export function getSessionServerBase(): string | null {
  return storageGet(SERVER_KEY)
}

export function clearSessionToken(): void {
  token = null
  adminSession = false
  storageRemove(TOKEN_KEY)
  storageRemove(USERNAME_KEY)
  storageRemove(TIER_KEY)
  storageRemove(SERVER_KEY)
}

// Whether the current session is a SERVER-VERIFIED admin (set by AuthProvider
// once fetchCapabilityProfile resolves — never from a spoofable client guess;
// see docs/SECURITY.md §4). Drives the Filter header: admins query with
// Filter:false to see system-owned objects (e.g. the HostedEngine VM has no
// explicit per-user permission, so Filter:true hides it). Defaults false →
// Filter:true, the safe least-privilege scoping, until the profile confirms.
// The engine remains the real authZ gate: it rejects Filter:false from actual
// non-admins, so this cannot escalate access.
//
// The flag persists per-tab beside the token it belongs to (TIER_KEY): a
// refresh-restored session re-seeds the tier the SAME server-verified profile
// established when the token was stored, so the first wave of requests uses
// the right Filter scoping instead of fetching everything user-scoped and
// then refetching it all once the profile confirms (the startup double-fetch
// this removes — see AuthProvider.loadCapabilities). The profile is STILL
// re-verified on every boot; a stale hint cannot escalate (the engine rejects
// Filter:false from real non-admins) and any mismatch triggers a wholesale
// refetch under the corrected scoping. Tradeoff recorded in
// docs/SECURITY.md §3 beside the token-persistence note.
let adminSession = storageGet(TOKEN_KEY) !== null && storageGet(TIER_KEY) === 'admin'

export function setSessionAdmin(isAdmin: boolean): void {
  adminSession = isAdmin
  storageSet(TIER_KEY, isAdmin ? 'admin' : 'user')
}

export function isSessionAdmin(): boolean {
  return adminSession
}
