import { useSyncExternalStore } from 'react'
import { clearSessionToken, getSessionServerBase, getSessionToken } from '../api/session'
import { getRuntimeConfig, type ServerEntry } from '../config/runtime'

// Multi-engine registry: which configured engine the console talks to.
//
// The server LIST comes only from deploy-time runtime config (config.js →
// config/runtime.ts); nothing here lets a user add one. This module owns the
// ACTIVE selection, resolved once per page load in priority order:
//
//   1. A live per-tab session's stamped base (sessionStorage, api/session.ts)
//      — a refresh must reconnect to the engine that issued the token. If the
//      stamped base is no longer configured, the session is DISCARDED here so
//      the token can never be sent to a different engine.
//   2. The last-picked base (localStorage) — the login page remembers your
//      server across sessions, like the auth-profile select does.
//   3. The first configured server, or same-origin ('') when none are
//      configured — which is exactly the pre-feature behavior.
//
// '' is the same-origin base (the engine that served the page); a non-empty
// base is an engine origin like 'https://engine2.example.com'. transport.ts
// and api/auth.ts prefix every API/SSO call with getActiveBase().

const ACTIVE_KEY = 'console-active-server'

function readStored(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function writeStored(base: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, base)
  } catch {
    // storage unavailable (lockdown/private mode) — selection lasts this page
  }
}

function isConfigured(base: string): boolean {
  // '' (same-origin) is always a legal base: it is the pre-feature default
  // and the base the engine-injected window.userInfo session belongs to,
  // whether or not the deployer also listed the local engine in config.js.
  return base === '' || getRuntimeConfig().servers.some((s) => s.base === base)
}

let active: string | undefined
const listeners = new Set<() => void>()

function resolveInitial(): string {
  const sessionBase = getSessionServerBase()
  if (sessionBase !== null && getSessionToken() !== null) {
    if (isConfigured(sessionBase)) return sessionBase
    // The engine this tab's token belongs to has been removed from the
    // configured list — never fall through to a different engine with it.
    clearSessionToken()
  }
  const stored = readStored()
  if (stored !== null && isConfigured(stored)) return stored
  const servers = getRuntimeConfig().servers
  return servers.length > 0 ? servers[0].base : ''
}

export function getActiveBase(): string {
  active ??= resolveInitial()
  return active
}

export function getServers(): ServerEntry[] {
  return getRuntimeConfig().servers
}

export function getActiveServer(): ServerEntry | null {
  const base = getActiveBase()
  return getServers().find((s) => s.base === base) ?? null
}

// Login-page picker (pre-auth) and the console-tab handoff. Ignores bases
// that aren't configured — the select only offers configured ones, so a
// mismatch means stale/foreign input, and same-origin stays the safe floor.
export function setActiveBase(base: string): void {
  if (!isConfigured(base)) return
  if (getActiveBase() === base) return
  active = base
  writeStored(base)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// React view of the active base (login page select, masthead label).
export function useActiveBase(): string {
  return useSyncExternalStore(subscribe, getActiveBase)
}

// Rebase a same-origin path (e.g. the default '/ovirt-engine-grafana') onto
// the active engine, so per-engine services resolve on the engine the session
// belongs to. Absolute URLs are deployer-pinned and pass through untouched.
export function rebase(url: string): string {
  return url.startsWith('/') && !url.startsWith('//') ? `${getActiveBase()}${url}` : url
}

// Test-only: forget the resolved selection so a test can vary storage/config
// (pairs with config/runtime.ts resetRuntimeConfigForTest).
export function resetServersForTest(): void {
  active = undefined
  listeners.clear()
}
