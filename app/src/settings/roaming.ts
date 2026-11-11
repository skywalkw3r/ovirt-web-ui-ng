import { ApiError } from '../api/transport'
import type { UserOption } from '../api/resources/userOptions'
import { isTheme, type Theme } from '../theme/context'
import type { UserSettings } from './context'
import { sanitizeSettings } from './sanitize'

// Roaming preferences: one JSON blob in the engine's per-user options
// (/users/{id}/options), so refresh interval, preferred console, language,
// session timeout and theme follow the user across browsers.
//
// Namespacing: the store is shared by every client of the user's profile.
// webadmin keeps its settings under one option named 'webAdmin'
// (WebAdminSettings.WEB_ADMIN) and the VM Portal one option per setting
// prefixed 'vmPortal.' (ovirtapi/transform.js VM_PORTAL_PREFIX). This console
// owns exactly one option, ROAMING_OPTION_NAME, and never reads, rewrites or
// deletes any other.

export const ROAMING_OPTION_NAME = 'webUiNg.settings'

// Bumped only on an incompatible shape change; a reader ignores fields it
// does not understand and keeps them on write-back (see encodeRoamingBlob).
export const ROAMING_BLOB_VERSION = 1

// Trailing debounce for engine writes: a burst of changes (clicking through
// the refresh choices) becomes one DELETE + POST.
export const ROAMING_WRITE_DEBOUNCE_MS = 1_000

export type RoamedValues = UserSettings & { theme: Theme }

export type RoamingStatus =
  // no session, or the first engine read is still in flight
  | 'pending'
  // the engine holds this user's preferences; changes are written back
  | 'roaming'
  // the engine refused (403/404, an engine older than 4.4.5) or failed: the
  // preferences live in this browser's localStorage only
  | 'local'

interface DecodedBlob {
  values: RoamedValues
  // keys this version does not own (written by a newer console), preserved
  extra: Record<string, unknown>
}

const OWNED_KEYS: ReadonlySet<string> = new Set<keyof RoamedValues | 'version'>([
  'version',
  'refreshIntervalMs',
  'preferredConsole',
  'locale',
  'sessionTimeoutMinutes',
  'theme',
])

// Parses an option's content (JSON encoded as a string). Fields are validated
// one by one against `base` (the current local values), so a hand-edited or
// partly unknown blob only overrides what it carries validly. null when the
// content is not a JSON object at all.
export function decodeRoamingBlob(
  content: string | undefined,
  base: RoamedValues,
): DecodedBlob | null {
  if (content === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const raw = parsed as Record<string, unknown>
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!OWNED_KEYS.has(key)) extra[key] = value
  }
  return {
    values: {
      ...sanitizeSettings(raw, base),
      theme: isTheme(raw.theme) ? raw.theme : base.theme,
    },
    extra,
  }
}

// Fixed key order, so equal values always encode to the same string and the
// sync can compare encodings to skip no-op writes.
export function encodeRoamingBlob(
  values: RoamedValues,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    ...extra,
    version: ROAMING_BLOB_VERSION,
    refreshIntervalMs: values.refreshIntervalMs,
    preferredConsole: values.preferredConsole,
    locale: values.locale,
    sessionTimeoutMinutes: values.sessionTimeoutMinutes,
    theme: values.theme,
  })
}

// The merge rule when both copies exist at sign-in. The engine copy is the
// roaming source of truth and wins field by field, EXCEPT for a field the
// user changed in this tab after the session started and before the engine
// read landed (`current` differs from `boot`): that is a newer, deliberate
// choice, so it is kept and written back. localStorage is not timestamped
// against the engine — its only job is the first paint and the fallback.
export function mergeOnLoad(
  remote: RoamedValues,
  current: RoamedValues,
  boot: RoamedValues,
): RoamedValues {
  const pick = <K extends keyof RoamedValues>(key: K): RoamedValues[K] =>
    current[key] !== boot[key] ? current[key] : remote[key]
  return {
    refreshIntervalMs: pick('refreshIntervalMs'),
    preferredConsole: pick('preferredConsole'),
    locale: pick('locale'),
    sessionTimeoutMinutes: pick('sessionTimeoutMinutes'),
    theme: pick('theme'),
  }
}

// 403: the user may not read/write their profile. 404: an engine older than
// 4.4.5 (no options collection) or a user the engine cannot resolve. Both
// mean "this engine will not roam", for the whole session.
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404)
}

export interface RoamingSyncDeps {
  fetchUserId: () => Promise<string | undefined>
  list: (userId: string) => Promise<UserOption[]>
  add: (userId: string, name: string, content: string) => Promise<UserOption>
  remove: (userId: string, optionId: string) => Promise<void>
  // the live local values (settings + theme)
  getValues: () => RoamedValues
  // applies the merged values locally (SettingsProvider + ThemeProvider)
  apply: (values: RoamedValues) => void
  onStatus: (status: RoamingStatus) => void
  debounceMs?: number
}

export interface RoamingSync {
  // the local values changed; schedules a debounced write when they differ
  // from what the engine holds
  notifyChange: () => void
  // runs a pending debounced write now
  flush: () => Promise<void>
  stop: () => void
  // resolves once the initial read (and any seed/merge write it started) is done
  ready: Promise<void>
}

// One sync session per signed-in user. Framework-free so the protocol is unit
// tested without React; RoamingSettingsProvider wires it to the contexts.
export function startRoamingSync(deps: RoamingSyncDeps): RoamingSync {
  const debounceMs = deps.debounceMs ?? ROAMING_WRITE_DEBOUNCE_MS
  let stopped = false
  let status: RoamingStatus = 'pending'
  let userId: string | undefined
  let optionId: string | undefined
  let extra: Record<string, unknown> = {}
  // the encoding the engine is known to hold (undefined: nothing / unknown)
  let synced: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // writes run strictly one after another
  let chain: Promise<void> = Promise.resolve()

  const setStatus = (next: RoamingStatus) => {
    if (stopped || status === next) return
    status = next
    deps.onStatus(next)
  }

  const fallBackToLocal = (error?: unknown) => {
    if (error !== undefined && !isRefusal(error)) {
      console.warn('Preferences are not roaming: the engine user-options call failed', error)
    }
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    setStatus('local')
  }

  const findOwn = (options: UserOption[]): UserOption | undefined =>
    options.find((option) => option.name === ROAMING_OPTION_NAME)

  const post = async (id: string, content: string): Promise<void> => {
    const created = await deps.add(id, ROAMING_OPTION_NAME, content)
    optionId = created.id
    synced = content
  }

  // DELETE + POST (the engine has no update). Reads the values at write
  // time, so a burst collapses to the latest state.
  const write = async (): Promise<void> => {
    if (stopped || status !== 'roaming' || userId === undefined) return
    const id = userId
    const content = encodeRoamingBlob(deps.getValues(), extra)
    if (content === synced) return
    try {
      if (optionId !== undefined) {
        try {
          await deps.remove(id, optionId)
        } catch (error) {
          // already gone (another tab or device rewrote it): carry on and add
          if (!(error instanceof ApiError && error.status === 404)) throw error
        }
        optionId = undefined
        synced = undefined
      }
      try {
        await post(id, content)
      } catch (error) {
        if (isRefusal(error)) throw error
        // most likely a concurrent writer re-created the option between our
        // DELETE and POST (the engine rejects a duplicate name): replace
        // theirs once, last writer wins
        const existing = findOwn(await deps.list(id))
        if (existing?.id === undefined) throw error
        await deps.remove(id, existing.id)
        await post(id, content)
      }
    } catch (error) {
      if (isRefusal(error)) {
        fallBackToLocal(error)
        return
      }
      // transient: keep roaming; the next change (or flush) retries
      console.warn('Saving preferences to the engine user profile failed', error)
    }
  }

  const enqueue = (): Promise<void> => {
    chain = chain.then(write, write)
    return chain
  }

  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void enqueue()
    }, debounceMs)
  }

  const boot = deps.getValues()

  const ready = (async () => {
    try {
      const id = await deps.fetchUserId()
      if (stopped) return
      if (id === undefined) {
        fallBackToLocal()
        return
      }
      const options = await deps.list(id)
      if (stopped) return
      userId = id
      const current = deps.getValues()
      const own = findOwn(options)
      const decoded = decodeRoamingBlob(own?.content, current)
      if (own !== undefined && decoded !== null) {
        extra = decoded.extra
        optionId = own.id
        // the engine copy, canonically encoded, is what it now holds
        synced = encodeRoamingBlob(decoded.values, extra)
        const merged = mergeOnLoad(decoded.values, current, boot)
        deps.apply(merged)
      } else if (own !== undefined) {
        // unparseable content under our name: replace it with the local copy
        optionId = own.id
      }
      setStatus('roaming')
      // seeds a first-time profile, writes back kept local edits, or repairs
      // a malformed blob; a no-op when the merge took the engine copy whole
      await enqueue()
    } catch (error) {
      if (!stopped) fallBackToLocal(error)
    }
  })()

  return {
    notifyChange: () => {
      if (stopped || status !== 'roaming') return
      if (encodeRoamingBlob(deps.getValues(), extra) === synced) {
        if (timer !== undefined) clearTimeout(timer)
        timer = undefined
        return
      }
      schedule()
    },
    flush: () => {
      if (timer === undefined) return chain
      clearTimeout(timer)
      timer = undefined
      return enqueue()
    },
    stop: () => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    },
    ready,
  }
}
