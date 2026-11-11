import { getRequestBase, getServers } from '../servers/registry'
import type { ExtensionSession } from './api'

// The loader and the per-plugin API objects live outside React, but toasts,
// navigation, the signed-in user and the locale live inside it.
// ExtensionsHost (mounted once in the authenticated shell) keeps this bridge
// current; until it mounts, the defaults below apply.

export type BridgeNotifyVariant = 'success' | 'info' | 'warning' | 'danger'

export interface ExtensionsBridge {
  notify: (title: string, variant: BridgeNotifyVariant) => void
  navigate: (path: string) => void
  userName: string | null
  isAdmin: boolean
  locale: string
}

const DEFAULT_BRIDGE: ExtensionsBridge = {
  notify: (title) => console.info(`[plugins] ${title}`),
  navigate: () => console.warn('[plugins] navigation is not available yet'),
  userName: null,
  isAdmin: false,
  locale: 'en',
}

let bridge: ExtensionsBridge = DEFAULT_BRIDGE

export function getBridge(): ExtensionsBridge {
  return bridge
}

export function updateBridge(patch: Partial<ExtensionsBridge>): void {
  bridge = { ...bridge, ...patch }
}

// Configured name of the engine the session's requests go to (the token's
// engine, getRequestBase), or null on a single-engine console.
export function currentEngineName(): string | null {
  const base = getRequestBase()
  return getServers().find((server) => server.base === base)?.name ?? null
}

// Whether a plugin's config.js `servers` filter admits the current engine.
export function engineAllowed(servers: readonly string[] | undefined): boolean {
  if (servers === undefined) return true
  const engine = currentEngineName()
  return engine !== null && servers.includes(engine)
}

export function sessionFrom(
  userName: string | null,
  isAdmin: boolean,
  engineName: string | null,
): ExtensionSession {
  return Object.freeze({
    userName,
    tier: isAdmin ? 'admin' : 'user',
    isAdmin,
    engineName,
  })
}

export function resetBridgeForTest(): void {
  bridge = DEFAULT_BRIDGE
}
