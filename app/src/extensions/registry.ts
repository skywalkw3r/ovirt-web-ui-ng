import { useSyncExternalStore } from 'react'
import type {
  ActionContribution,
  DashboardCardContribution,
  EntityActionKind,
  EntityTabContribution,
  EntityTabKind,
  NavPageContribution,
} from './api'

// The extension registry: what each allow-listed plugin is doing (loading,
// active, failed) and what it contributed. One immutable snapshot, replaced
// on every change, read through useSyncExternalStore so contribution points
// re-render as registrations arrive (ADR-0001 §2: the shell never waits for
// plugins). Nothing here persists: a reload starts from config.js again, so
// removing a plugin from the allow-list removes it from the UI.

export type PluginStatus = 'loading' | 'active' | 'failed' | 'skipped'

export interface PluginState {
  name: string
  status: PluginStatus
  // manifest origin, shown in the About dialog so an admin can see where
  // code came from
  origin: string
  displayName: string
  version?: string
  // English diagnostic for the deployer (About dialog, browser console)
  error?: string
  // config.js servers filter; contributions render only on those engines
  servers?: readonly string[]
}

export interface Registered<C> {
  plugin: string
  // `<plugin>:<id>`, unique across the registry
  key: string
  contribution: C
}

export type Catalogs = Readonly<Record<string, Readonly<Record<string, string>>>>

export interface ExtensionSnapshot {
  plugins: readonly PluginState[]
  navPages: readonly Registered<NavPageContribution>[]
  entityTabs: readonly Registered<EntityTabContribution<EntityTabKind>>[]
  actions: readonly Registered<ActionContribution<EntityActionKind>>[]
  dashboardCards: readonly Registered<DashboardCardContribution>[]
  catalogs: Readonly<Record<string, Catalogs>>
}

export type ContributionBatch = {
  navPages?: Registered<NavPageContribution>[]
  entityTabs?: Registered<EntityTabContribution<EntityTabKind>>[]
  actions?: Registered<ActionContribution<EntityActionKind>>[]
  dashboardCards?: Registered<DashboardCardContribution>[]
}

const EMPTY: ExtensionSnapshot = {
  plugins: [],
  navPages: [],
  entityTabs: [],
  actions: [],
  dashboardCards: [],
  catalogs: {},
}

let snapshot: ExtensionSnapshot = EMPTY
const listeners = new Set<() => void>()

function publish(next: ExtensionSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

export function getExtensionSnapshot(): ExtensionSnapshot {
  return snapshot
}

export function subscribeExtensions(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useExtensionSnapshot(): ExtensionSnapshot {
  return useSyncExternalStore(subscribeExtensions, getExtensionSnapshot, getExtensionSnapshot)
}

export function getPluginState(name: string): PluginState | undefined {
  return snapshot.plugins.find((plugin) => plugin.name === name)
}

// Insert or update one plugin's status row (allow-list order is kept: the
// loader registers every entry as 'loading' up front).
export function setPluginState(state: PluginState): void {
  const exists = snapshot.plugins.some((plugin) => plugin.name === state.name)
  publish({
    ...snapshot,
    plugins: exists
      ? snapshot.plugins.map((plugin) => (plugin.name === state.name ? state : plugin))
      : [...snapshot.plugins, state],
  })
}

// Add a plugin's registrations in one step. activate() registrations are
// buffered and committed only once it returns, which is what rolls back a
// partial activation (ADR-0001 §5): a throw means the buffer is dropped.
export function commitContributions(batch: ContributionBatch): void {
  publish({
    ...snapshot,
    navPages: batch.navPages?.length
      ? [...snapshot.navPages, ...batch.navPages]
      : snapshot.navPages,
    entityTabs: batch.entityTabs?.length
      ? [...snapshot.entityTabs, ...batch.entityTabs]
      : snapshot.entityTabs,
    actions: batch.actions?.length ? [...snapshot.actions, ...batch.actions] : snapshot.actions,
    dashboardCards: batch.dashboardCards?.length
      ? [...snapshot.dashboardCards, ...batch.dashboardCards]
      : snapshot.dashboardCards,
  })
}

// Merge a plugin's message catalogs (per locale, later registrations win).
export function mergeCatalogs(plugin: string, catalogs: Catalogs): void {
  const current = snapshot.catalogs[plugin] ?? {}
  const merged: Record<string, Readonly<Record<string, string>>> = { ...current }
  for (const [locale, messages] of Object.entries(catalogs)) {
    merged[locale] = { ...(current[locale] ?? {}), ...messages }
  }
  publish({ ...snapshot, catalogs: { ...snapshot.catalogs, [plugin]: merged } })
}

// Test-only: forget every plugin and contribution.
export function resetExtensionsForTest(): void {
  snapshot = EMPTY
  listeners.clear()
}
