import { getRuntimeConfig, type PluginEntry } from '../config/runtime'
import type { ExtensionModule } from './api'
import { engineAllowed } from './bridge'
import { createExtensionApi, newSink } from './hostApi'
import { parseManifest } from './manifest'
import { commitContributions, getPluginState, setPluginState, type PluginState } from './registry'
import { installSharedModules } from './shared'

// The plugin loader (ADR-0001 §2). After sign-in, for every allow-listed
// plugin, in parallel and each on its own:
//   1. fetch the manifest and validate it against the allow-list entry,
//   2. fill the shared-module table, then import() the entry module,
//   3. call activate(api); its registrations commit only if it returns.
// Every step has a timeout, and any failure marks that one plugin failed
// (About dialog + a console warning) without touching the others or the
// shell. Nothing waits for plugins: the shell renders immediately and
// contributions appear as plugins activate.

export interface LoaderDeps {
  fetchJson: (url: string) => Promise<unknown>
  importModule: (url: string) => Promise<unknown>
  installShared: () => Promise<void>
  timeouts: { manifest: number; entry: number; activate: number }
}

async function fetchManifestJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    // no-cache: a deployer's edit shows on the next load. redirect 'error':
    // the manifest URL in config.js is the one that is trusted, so a
    // redirect somewhere else is a failure, not a hop to follow.
    cache: 'no-cache',
    redirect: 'error',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`manifest request failed (HTTP ${response.status})`)
  return response.json()
}

const DEFAULT_DEPS: LoaderDeps = {
  fetchJson: fetchManifestJson,
  // @vite-ignore: the URL is only known at run time (config.js), and it must
  // stay a native import() so the browser enforces CSP script-src on it.
  importModule: (url) => import(/* @vite-ignore */ url),
  installShared: installSharedModules,
  timeouts: { manifest: 10_000, entry: 15_000, activate: 10_000 },
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

// Plugins this page load has started (loading, active or failed). A plugin
// is attempted once per page load; a reload is the retry.
const started = new Set<string>()

async function loadPlugin(entry: PluginEntry, deps: LoaderDeps): Promise<void> {
  const base: PluginState = {
    name: entry.name,
    status: 'loading',
    origin: originOf(entry.manifest),
    displayName: entry.name,
    servers: entry.servers,
  }
  setPluginState(base)
  let state = base
  const fail = (error: string) => {
    console.warn(`[plugins] "${entry.name}" was not loaded: ${error}`)
    setPluginState({ ...state, status: 'failed', error })
  }

  let json: unknown
  try {
    json = await withTimeout(deps.fetchJson(entry.manifest), deps.timeouts.manifest, 'manifest')
  } catch (error) {
    fail(errorText(error))
    return
  }
  const result = parseManifest(json, entry.name, entry.manifest)
  if (!result.ok) {
    fail(result.error)
    return
  }
  const { manifest } = result
  state = { ...state, displayName: manifest.displayName, version: manifest.version }
  setPluginState(state)

  let module: unknown
  try {
    await deps.installShared()
    module = await withTimeout(deps.importModule(manifest.entryUrl), deps.timeouts.entry, 'entry')
  } catch (error) {
    fail(`entry module failed to load: ${errorText(error)}`)
    return
  }
  const activate = (module as Partial<ExtensionModule> | null)?.activate
  if (typeof activate !== 'function') {
    fail('entry module does not export activate()')
    return
  }

  const sink = newSink()
  const api = createExtensionApi(entry.name, sink)
  try {
    // .then() so a synchronous throw lands in the same catch as a rejection
    await withTimeout(
      Promise.resolve().then(() => activate(api)),
      deps.timeouts.activate,
      'activate()',
    )
  } catch (error) {
    // the buffered registrations are dropped: a failed activation leaves
    // nothing behind in the UI
    fail(`activate() failed: ${errorText(error)}`)
    return
  }
  commitContributions(sink.pending)
  sink.live = commitContributions
  setPluginState({ ...state, status: 'active' })
}

// Load every allow-listed plugin that applies to this session's engine and
// has not been attempted yet. Safe to call on every sign-in: a plugin
// skipped for one engine loads when the user signs in to an engine its
// `servers` filter names.
export async function startExtensions(deps: LoaderDeps = DEFAULT_DEPS): Promise<void> {
  const { plugins } = getRuntimeConfig()
  if (!plugins.enabled || plugins.list.length === 0) return
  const due: PluginEntry[] = []
  for (const entry of plugins.list) {
    if (started.has(entry.name)) continue
    if (!engineAllowed(entry.servers)) {
      if (getPluginState(entry.name) === undefined) {
        setPluginState({
          name: entry.name,
          status: 'skipped',
          origin: originOf(entry.manifest),
          displayName: entry.name,
          servers: entry.servers,
        })
      }
      continue
    }
    started.add(entry.name)
    due.push(entry)
  }
  await Promise.all(due.map((entry) => loadPlugin(entry, deps)))
}

// Test-only: forget which plugins this page load attempted.
export function resetLoaderForTest(): void {
  started.clear()
}
