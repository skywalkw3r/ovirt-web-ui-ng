import { getActiveBase } from '../servers/registry'
import { getSessionToken, isSessionAdmin } from './session'

// The engine-relative API path. The full fetch URL is prefixed with the
// active server's base (servers/registry.ts): '' — the default and the only
// possibility when no servers are configured — keeps every call same-origin
// (Vite dev proxy / the engine's own Apache), while a configured external
// engine contributes its https origin (CORS-enabled on the engine side; see
// packaging/engine-cors/).
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

// oVirt error envelope: { fault: { reason, detail } }
function extractFault(payload: unknown): { reason?: string; detail?: string } {
  if (typeof payload !== 'object' || payload === null) return {}
  const fault = (payload as { fault?: { reason?: string; detail?: string } }).fault
  return { reason: fault?.reason, detail: fault?.detail }
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
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      // Filter:true scopes results to objects the user is explicitly permitted
      // on; Filter:false (admins only) returns everything the engine holds,
      // including system-owned objects like the HostedEngine VM that carry no
      // per-user permission. Driven by the SERVER-VERIFIED admin flag (see
      // session.ts / docs/SECURITY.md §4) — the engine rejects Filter:false
      // from real non-admins, so this can't escalate access.
      Filter: isSessionAdmin() ? 'false' : 'true',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.correlationId !== undefined ? { 'Correlation-Id': opts.correlationId } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined)
    const { reason, detail } = extractFault(payload)
    throw new ApiError(response.status, reason, detail)
  }

  if (response.status === 204) return undefined
  return response.json()
}
