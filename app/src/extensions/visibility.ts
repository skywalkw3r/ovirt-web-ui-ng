import { useMemo } from 'react'
import { useAuth } from '../auth/context'
import { useCapabilities } from '../auth/capabilities'
import type { EntityContext, EntityKind, ExtensionSession, VisibilityContext } from './api'
import { currentEngineName, engineAllowed, sessionFrom } from './bridge'
import { getPluginState } from './registry'

// Session view handed to isVisible / isDisabled predicates while rendering.
// Read through the auth hooks so a capability change re-renders every
// contribution point.
export function useExtensionSession(): ExtensionSession {
  const { username } = useAuth()
  const { isAdmin } = useCapabilities()
  return useMemo(() => sessionFrom(username, isAdmin, currentEngineName()), [username, isAdmin])
}

// Run a plugin predicate. A throw counts as `fallback` and is logged with
// the plugin's name: a buggy predicate hides one contribution, never the
// menu or page that hosts it.
export function safePredicate<E>(
  plugin: string,
  predicate: ((context: VisibilityContext<E>) => boolean) | undefined,
  context: VisibilityContext<E>,
  fallback: boolean,
): boolean {
  if (predicate === undefined) return fallback
  try {
    return predicate(context) === true
  } catch (error) {
    console.warn(`[plugins] "${plugin}" predicate threw`, error)
    return fallback
  }
}

// Whether a plugin's contributions belong on this session's engine (the
// config.js `servers` filter, checked at render time as well as at load so
// a sign-in to another engine without a reload hides them).
export function pluginApplies(plugin: string): boolean {
  const state = getPluginState(plugin)
  return state?.status === 'active' && engineAllowed(state.servers)
}

// Build the stable EntityContext for a console entity object.
export function toEntityContext<K extends EntityKind>(
  kind: K,
  data: { id: string; name?: string | null } & object,
): EntityContext<K> {
  const record = data as unknown as Record<string, unknown>
  const status = record.status
  return Object.freeze({
    kind,
    id: data.id,
    name: typeof data.name === 'string' && data.name !== '' ? data.name : data.id,
    ...(typeof status === 'string' ? { status } : {}),
    data: Object.freeze({ ...record }),
  })
}
