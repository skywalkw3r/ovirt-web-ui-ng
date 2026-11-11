import {
  DEFAULT_LOCALE,
  DEFAULT_PREFERRED_CONSOLE,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  isLocale,
  isSessionTimeout,
  type UserSettings,
} from './context'

export const DEFAULT_SETTINGS: UserSettings = {
  refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,
  preferredConsole: DEFAULT_PREFERRED_CONSOLE,
  locale: DEFAULT_LOCALE,
  sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
}

// The smallest cadence the UI itself offers (UserMenu REFRESH_INTERVAL_OPTIONS_MS
// = [5s, 10s, 30s, 60s]). A corrupted or hand-edited stored value below this
// (e.g. 100) would otherwise drive every raw-cadence poll hook at 100ms — a
// single-browser engine DoS. The engine user-options blob is just as untrusted
// (any client of /users/{id}/options can write it). Clamping up to 5s never
// contradicts a legitimate user choice, so we enforce it on read AND on set.
export const MIN_REFRESH_INTERVAL_MS = 5_000

// A non-finite/non-positive cadence is meaningless (not merely too small), so it
// resets to the fallback; a valid-but-too-small one clamps up to the floor.
export function clampRefreshInterval(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.max(value, MIN_REFRESH_INTERVAL_MS)
}

// Field-by-field validation of an untrusted settings object (localStorage
// JSON or the engine user-options blob), in the spirit of legacy
// optionsManager.js loadConsoleOptions: anything missing or unrecognized
// keeps the value from `base`.
export function sanitizeSettings(raw: unknown, base: UserSettings): UserSettings {
  if (typeof raw !== 'object' || raw === null) return base
  const stored = raw as Partial<Record<keyof UserSettings, unknown>>
  return {
    refreshIntervalMs: clampRefreshInterval(stored.refreshIntervalMs, base.refreshIntervalMs),
    preferredConsole:
      stored.preferredConsole === 'vnc' || stored.preferredConsole === 'spice'
        ? stored.preferredConsole
        : base.preferredConsole,
    locale: isLocale(stored.locale) ? stored.locale : base.locale,
    sessionTimeoutMinutes: isSessionTimeout(stored.sessionTimeoutMinutes)
      ? stored.sessionTimeoutMinutes
      : base.sessionTimeoutMinutes,
  }
}

export function sameSettings(a: UserSettings, b: UserSettings): boolean {
  return (
    a.refreshIntervalMs === b.refreshIntervalMs &&
    a.preferredConsole === b.preferredConsole &&
    a.locale === b.locale &&
    a.sessionTimeoutMinutes === b.sessionTimeoutMinutes
  )
}
