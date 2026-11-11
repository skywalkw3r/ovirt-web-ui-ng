import { getSessionToken } from '../api/session'
import { getRuntimeConfig } from '../config/runtime'
import { getRequestBase, getServers } from '../servers/registry'

// Host console: opens a host's Cockpit web console in a new browser tab
// (docs/HOST-CONSOLE.md, docs/ADR-0001-UI-EXTENSIONS.md section 7).
//
// Two modes:
//   direct: https://<host address>:<port> (default 9090). Cockpit asks for a
//           host account and serves the host's own certificate. Works on every
//           engine release and is the default.
//   sso:    <ssoUrl>/=<host id>/<page>#access_token=<token>, the legacy
//           ovirt-cockpit-sso service that ran beside oVirt 4.2/4.3 engines.
//           Opt-in per deployment, because it hands the session token to that
//           service.
// Both open a new tab; nothing is framed, so the CSP is unchanged.

export type HostConsoleMode = 'direct' | 'sso'

export interface HostConsoleInfo {
  mode: HostConsoleMode
  // Token-free address, safe to render: the host's Cockpit origin in direct
  // mode, the SSO service origin in sso mode.
  displayUrl: string
}

interface ConsoleHost {
  id: string
  address?: string
}

// The SSO service of the engine this session's token belongs to. With a
// configured server list only that engine's own cockpitSsoUrl counts (a token
// is valid on one engine only, so the single-engine `cockpit.ssoUrl` must not
// leak it to a different engine's service); without one the console is
// single-engine and `cockpit.ssoUrl` applies.
function ssoOrigin(): string {
  const servers = getServers()
  if (servers.length === 0) return getRuntimeConfig().cockpit.ssoUrl
  const base = getRequestBase()
  return servers.find((server) => server.base === base)?.cockpitSsoUrl ?? ''
}

// https://<address>:<port>, or undefined when the engine-reported address
// cannot form a URL. An IPv6 literal needs brackets; the round trip through
// URL rejects anything carrying a path, credentials or other URL syntax.
function directUrl(address: string | undefined, port: number): string | undefined {
  const trimmed = address?.trim()
  if (!trimmed) return undefined
  const hostPart = trimmed.includes(':') && !trimmed.startsWith('[') ? `[${trimmed}]` : trimmed
  try {
    const parsed = new URL(`https://${hostPart}:${port}`)
    if (parsed.hostname.toLowerCase() !== hostPart.toLowerCase()) return undefined
    if (parsed.pathname !== '/' || parsed.username || parsed.password) return undefined
    return parsed.origin
  } catch {
    return undefined
  }
}

// What the UI needs to decide whether, and how, to offer the host console.
// Never contains the token, so it is safe to call from render. undefined
// hides the entry point: the feature is off, or the host has no usable address
// and no SSO service is configured.
export function hostConsoleInfo(host: ConsoleHost): HostConsoleInfo | undefined {
  const cockpit = getRuntimeConfig().cockpit
  if (!cockpit.enabled) return undefined
  const sso = ssoOrigin()
  if (sso !== '' && host.id !== '') return { mode: 'sso', displayUrl: sso }
  const direct = directUrl(host.address, cockpit.port)
  return direct === undefined ? undefined : { mode: 'direct', displayUrl: direct }
}

// The URL to open, built at click time so the token never sits in the DOM. The
// token rides the fragment, which browsers do not send in the request or in a
// Referer header. A session that lost its token mid-click falls back to the
// direct link.
export function hostConsoleUrl(host: ConsoleHost): string | undefined {
  const info = hostConsoleInfo(host)
  if (info === undefined) return undefined
  const cockpit = getRuntimeConfig().cockpit
  if (info.mode === 'sso') {
    const token = getSessionToken()
    if (token) {
      return (
        `${info.displayUrl}/=${encodeURIComponent(host.id)}/${cockpit.ssoPage}` +
        `#access_token=${encodeURIComponent(token)}`
      )
    }
    return directUrl(host.address, cockpit.port)
  }
  return info.displayUrl
}

// Opens the console in a new tab. noopener severs window.opener, so the
// Cockpit page cannot script or navigate this console (and no Referer is
// sent). Returns false when there was nothing to open.
export function openHostConsole(host: ConsoleHost): boolean {
  const url = hostConsoleUrl(host)
  if (url === undefined) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
