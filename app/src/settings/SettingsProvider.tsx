import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_LOCALE,
  DEFAULT_PREFERRED_CONSOLE,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  isLocale,
  isSessionTimeout,
  SettingsContext,
  type Locale,
  type PreferredConsole,
  type SessionTimeoutMinutes,
  type SettingsContextValue,
} from './context'

// Contract surface: SettingsProvider + useSettings both resolve from this
// module (the hook itself lives in context.ts, mirroring theme/ and auth/).
/* oxlint-disable react/only-export-components -- re-export required by the settings contract */
export {
  useSettings,
  SESSION_TIMEOUT_CHOICES,
  type Locale,
  type PreferredConsole,
  type SessionTimeoutMinutes,
  type SettingsContextValue,
} from './context'
/* oxlint-enable react/only-export-components */

// Settings persist in localStorage for now, mirroring legacy
// optionsManager.js (legacy/src/optionsManager.js). A later phase roams them
// through the engine's per-user options API instead — legacy
// sagas/options.js persistUserOption stores the same kind of preference as a
// JSON blob under /users/{id}/options so it follows the user across
// browsers — with localStorage kept as the mock-mode fallback.

const STORAGE_KEY = 'console-settings'

interface StoredSettings {
  refreshIntervalMs: number
  preferredConsole: PreferredConsole
  locale: Locale
  sessionTimeoutMinutes: SessionTimeoutMinutes
}

// Defensive parse, same spirit as legacy optionsManager.js loadConsoleOptions:
// malformed JSON or unrecognized values fall back field-by-field to defaults.
function initialSettings(): StoredSettings {
  const defaults: StoredSettings = {
    refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,
    preferredConsole: DEFAULT_PREFERRED_CONSOLE,
    locale: DEFAULT_LOCALE,
    sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return defaults
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return defaults
    const stored = parsed as Partial<Record<keyof StoredSettings, unknown>>
    return {
      refreshIntervalMs:
        typeof stored.refreshIntervalMs === 'number' &&
        Number.isFinite(stored.refreshIntervalMs) &&
        stored.refreshIntervalMs > 0
          ? stored.refreshIntervalMs
          : defaults.refreshIntervalMs,
      preferredConsole:
        stored.preferredConsole === 'vnc' || stored.preferredConsole === 'spice'
          ? stored.preferredConsole
          : defaults.preferredConsole,
      locale: isLocale(stored.locale) ? stored.locale : defaults.locale,
      sessionTimeoutMinutes: isSessionTimeout(stored.sessionTimeoutMinutes)
        ? stored.sessionTimeoutMinutes
        : defaults.sessionTimeoutMinutes,
    }
  } catch {
    return defaults
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoredSettings>(initialSettings)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const setRefreshIntervalMs = useCallback((refreshIntervalMs: number) => {
    setSettings((current) => ({ ...current, refreshIntervalMs }))
  }, [])

  const setPreferredConsole = useCallback((preferredConsole: PreferredConsole) => {
    setSettings((current) => ({ ...current, preferredConsole }))
  }, [])

  const setLocale = useCallback((locale: Locale) => {
    setSettings((current) => ({ ...current, locale }))
  }, [])

  const setSessionTimeoutMinutes = useCallback((sessionTimeoutMinutes: SessionTimeoutMinutes) => {
    setSettings((current) => ({ ...current, sessionTimeoutMinutes }))
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({
      refreshIntervalMs: settings.refreshIntervalMs,
      setRefreshIntervalMs,
      preferredConsole: settings.preferredConsole,
      setPreferredConsole,
      locale: settings.locale,
      setLocale,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      setSessionTimeoutMinutes,
    }),
    [settings, setRefreshIntervalMs, setPreferredConsole, setLocale, setSessionTimeoutMinutes],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
