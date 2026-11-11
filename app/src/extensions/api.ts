// The UI extension API, version 1 (docs/ADR-0001-UI-EXTENSIONS.md §3).
//
// These types ARE the contract with plugin authors. Keep the file
// self-contained: it may import React types and nothing else from the app,
// so it can be copied or published as `@ovirt-web-ui-ng/extension-api`
// without dragging app internals along. Within API major 1 every change is
// additive; a breaking change raises EXTENSION_API_VERSION and keeps the
// previous major working for at least one console minor release.
//
// A plugin's entry module exports `activate(api)`; everything a plugin can
// do goes through the `api` object handed to it. Nothing else in the app is
// public, and plugins must not reach into the shell's DOM.
import type { ComponentType } from 'react'

export const EXTENSION_API_VERSION = 1

// The API majors this console accepts in a manifest's `apiVersion`.
export const SUPPORTED_API_VERSIONS: readonly number[] = [1]

// ---------------------------------------------------------------------------
// Text

// Display text: a literal string (shown as is, in every locale) or a
// reference into the plugin's own message catalogs, resolved at render time
// so it follows the user's language switch. Create references with
// api.i18n.message().
export interface MessageRef {
  readonly messageId: string
  readonly values?: Readonly<Record<string, string | number>>
}

export type ExtensionText = string | MessageRef

// ---------------------------------------------------------------------------
// Entities

// Detail pages that accept plugin subtabs.
export type EntityTabKind =
  'vm' | 'host' | 'cluster' | 'storageDomain' | 'network' | 'dataCenter' | 'template' | 'disk'

// Entities whose menus accept plugin actions (API v1: the two menus that
// render everywhere the entity appears — list kebab, right-click menu,
// inventory trees and the detail page).
export type EntityActionKind = 'vm' | 'host'

export type EntityKind = EntityTabKind

// What a contribution learns about the entity it is shown for. `id`, `name`
// and `status` are the stable part of the contract. `data` is the engine
// object as this console read it (REST field names, snake_case): handy, but
// its shape follows the engine and the console's reads, not this API, so a
// plugin that needs a field it cannot rely on should fetch it through
// api.engine.request().
export interface EntityContext<K extends EntityKind = EntityKind> {
  readonly kind: K
  readonly id: string
  readonly name: string
  // engine status enum value ('up', 'maintenance', 'ok', …) when the entity
  // has one
  readonly status?: string
  readonly data: Readonly<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Session

export interface ExtensionSession {
  readonly userName: string | null
  // 'admin' when the engine granted an administrative role, else 'user'.
  // Convenience only: the engine enforces permissions on every call.
  readonly tier: 'user' | 'admin'
  readonly isAdmin: boolean
  // Configured name of the engine this session talks to (multi-engine
  // builds), or null on a single-engine console.
  readonly engineName: string | null
}

// Arguments to every isVisible / isDisabled predicate.
export interface VisibilityContext<E = undefined> {
  readonly session: ExtensionSession
  readonly entity: E
}

// ---------------------------------------------------------------------------
// Contributions

// Ids are local to the plugin: [a-z0-9][a-z0-9-]*, at most 64 characters.
// The console namespaces them as `<plugin>:<id>`, so two plugins never
// collide; registering the same id twice in one plugin is an error.

export interface NavPageContribution {
  id: string
  title: ExtensionText
  component: ComponentType<Record<string, never>>
  isVisible?: (context: VisibilityContext) => boolean
}

export interface EntityTabProps<K extends EntityTabKind = EntityTabKind> {
  entity: EntityContext<K>
}

export interface EntityTabContribution<K extends EntityTabKind = EntityTabKind> {
  entity: K
  id: string
  title: ExtensionText
  component: ComponentType<EntityTabProps<K>>
  isVisible?: (context: VisibilityContext<EntityContext<K>>) => boolean
}

// 'kebab': the entity's actions menu, wherever it renders (list row kebab,
// right-click menu, inventory tree, detail page kebab).
// 'header': a secondary button in the detail page header.
export type ActionPlacement = 'kebab' | 'header'

export interface ActionContribution<K extends EntityActionKind = EntityActionKind> {
  entity: K
  id: string
  label: ExtensionText
  // default ['kebab']
  placement?: readonly ActionPlacement[]
  isVisible?: (context: VisibilityContext<EntityContext<K>>) => boolean
  isDisabled?: (context: VisibilityContext<EntityContext<K>>) => boolean
  // A rejection (or throw) shows an error toast naming the plugin.
  run: (context: VisibilityContext<EntityContext<K>>) => void | Promise<void>
}

// Width on wide screens; every card is full width on narrow ones.
export type DashboardCardSize = 'small' | 'medium' | 'large'

export interface DashboardCardContribution {
  id: string
  title: ExtensionText
  component: ComponentType<Record<string, never>>
  // default 'medium'
  size?: DashboardCardSize
  isVisible?: (context: VisibilityContext) => boolean
}

// ---------------------------------------------------------------------------
// Services

export type EngineMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface EngineRequestOptions {
  method?: EngineMethod
  // serialized as JSON
  body?: unknown
  signal?: AbortSignal
}

// Thrown by api.engine.request on an engine fault (HTTP 4xx/5xx) or an
// invalid path. `status` is the HTTP status (0 for a rejected path).
export interface EngineError extends Error {
  readonly status: number
  readonly reason?: string
  readonly detail?: string
}

export interface ExtensionEngine {
  // `path` is relative to /ovirt-engine/api and starts with '/', for example
  // '/hosts/123/nics'. The console adds the session's bearer token and the
  // Filter header, picks the session's engine, and parses the JSON reply.
  // The plugin never sees the token and cannot set headers.
  request(path: string, options?: EngineRequestOptions): Promise<unknown>
}

export interface ExtensionI18n {
  // The active UI locale ('en', 'de', 'pt-BR', …).
  readonly locale: string
  // Register the plugin's catalogs: { en: { 'greeting': 'Hello {name}' }, de: {…} }.
  // Lookup order: the active locale, its language ('pt' for 'pt-BR'), 'en',
  // then the id itself. Placeholders are {name}; ICU plurals are not
  // supported in API v1.
  registerMessages(catalogs: Readonly<Record<string, Readonly<Record<string, string>>>>): void
  // A reference resolved at render time (follows a language switch).
  message(id: string, values?: Readonly<Record<string, string | number>>): MessageRef
  // Resolve now, in the active locale.
  format(id: string, values?: Readonly<Record<string, string | number>>): string
  // React hook for plugin components: returns format() bound to the
  // rendering locale, and re-renders the component when the locale changes.
  useFormat(): (id: string, values?: Readonly<Record<string, string | number>>) => string
}

export interface ExtensionNotify {
  success(title: string): void
  info(title: string): void
  warning(title: string): void
  danger(title: string): void
}

export interface ExtensionVersion {
  readonly api: number
  readonly app: string
}

export interface ExtensionApi {
  readonly version: ExtensionVersion
  // This plugin's allow-listed name.
  readonly pluginName: string
  readonly engine: ExtensionEngine
  readonly i18n: ExtensionI18n
  readonly notify: ExtensionNotify
  // Navigate to an app path ('/hosts/123', '/extensions/<plugin>/<page>').
  // Same-app paths only; anything else throws.
  navigate(path: string): void
  // Path of one of this plugin's nav pages, for links and navigate().
  navPagePath(pageId: string): string
  readonly session: ExtensionSession
  registerNavPage(contribution: NavPageContribution): void
  registerEntityTab<K extends EntityTabKind>(contribution: EntityTabContribution<K>): void
  registerAction<K extends EntityActionKind>(contribution: ActionContribution<K>): void
  registerDashboardCard(contribution: DashboardCardContribution): void
}

// The shape of a plugin's entry module.
export interface ExtensionModule {
  activate(api: ExtensionApi): void | Promise<void>
}

// The shared-module table (ADR §2): the console's own React and PatternFly
// instances, filled before any plugin module is imported. The SDK's Vite
// preset rewrites plugin imports of these packages onto it.
export const SHARED_MODULES_GLOBAL = 'ovirtWebUiNgShared'

export const SHARED_MODULE_IDS = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@patternfly/react-core',
  '@patternfly/react-table',
] as const

export type SharedModuleId = (typeof SHARED_MODULE_IDS)[number]
