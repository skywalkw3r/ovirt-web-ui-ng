import { getActiveBase } from '../servers/registry'
import { getSessionToken, isSessionAdmin } from './session'

// The engine-relative API path. The full fetch URL is prefixed with the
// active server's base (servers/registry.ts): '' — the default and the only
// possibility when no servers are configured — keeps every call same-origin
// (Vite dev proxy / the engine's own Apache), as does the same-origin
// path-proxy shape ('/e/<slug>') for a configured engine, while a
// direct-connect external engine contributes its https origin (per-engine CORS
// + a CSP connect-src entry; see docs/SECURITY-HEADERS.md §Multi-engine).
const API_PATH = '/ovirt-engine/api'

export class ApiError extends Error {
  readonly status: number
  readonly reason?: string
  readonly detail?: string

  constructor(status: number, reason?: string, detail?: string) {
    super(detail ?? reason ?? `oVirt API error (HTTP ${status})`)
    this.name = 'ApiError'
    this.status = status
    this.reason = reason
    this.detail = detail
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  // Optional caller-supplied correlation id. The engine stamps the value onto
  // the async Job the request spawns (job.correlation_id), so the Tasks view
  // can trace a task back to the UI action that started it and related log
  // lines share the tag. The header name 'Correlation-Id' is verified against
  // the oVirt/RHV REST API guide (there is also a legacy `correlation_id`
  // query/matrix parameter; the header is the documented, path-agnostic form).
  // Fully additive: unset means no header and unchanged behavior.
  correlationId?: string
}

// A real 401 from the engine means this session is over — the token expired or
// was revoked (possibly by another tab). AuthProvider registers here so that
// ANY request discovering it tears the session down immediately, rather than
// the app sitting there authenticated-looking, rendering per-query errors,
// until the 60s keep-alive happens to notice. Registered rather than imported
// to keep transport free of a dependency on React/auth state.
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

// oVirt error envelope: { fault: { reason, detail } }
function extractFault(payload: unknown): { reason?: string; detail?: string } {
  if (typeof payload !== 'object' || payload === null) return {}
  const fault = (payload as { fault?: { reason?: string; detail?: string } }).fault
  return { reason: fault?.reason, detail: fault?.detail }
}

// A hung engine must not pin a socket for the browser default (often minutes).
// A single view mounts dozens of poll queries; with keepalive they can exhaust
// the per-origin connection pool and stall discovery of an expired session (the
// 401 that tears it down). 30s is comfortably clear of a normal engine
// round-trip yet caps a dead socket fast. Safe as a BLANKET ceiling because
// every long-running action (VM/template/disk export, clone, migrate) returns
// an async-job envelope immediately and imageio blob transfers use a bare XHR,
// not this wrapper — nothing legitimately holds a request() connection open.
const REQUEST_TIMEOUT_MS = 30_000

// Compose the caller's signal (cancel-on-unmount) with the timeout so a request
// aborts on the sooner of the two. AbortSignal.timeout/any are evergreen and
// Node ≥20; on a runtime missing them, degrade to the caller signal alone
// (losing only the timeout) rather than throwing or polyfilling.
function requestSignal(caller: AbortSignal | undefined): AbortSignal | undefined {
  if (typeof AbortSignal.timeout !== 'function') return caller
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  if (!caller) return timeout
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([caller, timeout]) : caller
}

export async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
  const token = getSessionToken()
  if (!token) {
    throw new ApiError(401, 'Not authenticated')
  }

  // Dev-only mock mode (npm run dev:mock) — UI work without a lab engine.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK === '1') {
    const { mockRequest } = await import('./mock/handlers')
    return mockRequest(path, opts)
  }

  const response = await fetch(`${getActiveBase()}${API_PATH}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      // Accept + Content-Type are semantic defaults a caller may legitimately
      // override (e.g. a non-JSON Accept), so they sit BEFORE the caller spread.
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.correlationId !== undefined ? { 'Correlation-Id': opts.correlationId } : {}),
      ...opts.headers,
      // Security headers are transport-owned and set AFTER the caller spread so
      // no caller can clobber the bearer token or downgrade the result scope
      // (SECURITY.md §3). Filter:true scopes results to objects the user is
      // explicitly permitted on; Filter:false (admins only) returns everything
      // the engine holds, including system-owned objects like the HostedEngine
      // VM that carry no per-user permission. Driven by the SERVER-VERIFIED
      // admin flag (see session.ts / docs/SECURITY.md §4) — the engine rejects
      // Filter:false from real non-admins, so this can't escalate access.
      Authorization: `Bearer ${token}`,
      Filter: isSessionAdmin() ? 'false' : 'true',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: requestSignal(opts.signal),
  })

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined)
    const { reason, detail } = extractFault(payload)
    // 401 only — 403 is an authorization verdict on a live session (the engine
    // rejecting Filter:false, a permission the user lacks), and logging out on
    // one would turn a single forbidden read into a sign-out.
    if (response.status === 401) unauthorizedHandler?.()
    throw new ApiError(response.status, reason, detail)
  }

  if (response.status === 204) return undefined
  return response.json()
}
