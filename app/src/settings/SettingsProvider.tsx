import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_REFRESH_INTERVAL_MS,
  SettingsContext,
  type Locale,
  type PreferredConsole,
  type SessionTimeoutMinutes,
  type SettingsContextValue,
  type UserSettings,
} from './context'
import { clampRefreshInterval, DEFAULT_SETTINGS, sameSettings, sanitizeSettings } from './sanitize'

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
  type UserSettings,
} from './context'
/* oxlint-enable react/only-export-components */

// Settings persist in localStorage (mirroring legacy optionsManager.js), which
// is also the fast first paint. RoamingSettingsProvider (settings/roaming.ts)
// then roams them through the engine's per-user options API
// (/users/{id}/options) once a session exists, applying the engine's copy
// through replaceSettings; localStorage stays the fallback when the engine
// refuses.

const STORAGE_KEY = 'console-settings'

// Defensive parse: malformed JSON or unrecognized values fall back
// field-by-field to defaults (sanitizeSettings).
function initialSettings(): UserSettings {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return DEFAULT_SETTINGS
  try {
    return sanitizeSettings(JSON.parse(raw), DEFAULT_SETTINGS)
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(initialSettings)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const setRefreshIntervalMs = useCallback((refreshIntervalMs: number) => {
    setSettings((current) => ({
      ...current,
      refreshIntervalMs: clampRefreshInterval(refreshIntervalMs, DEFAULT_REFRESH_INTERVAL_MS),
    }))
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

  // Keeps the current object (no re-render, no write-back) when nothing changed.
  const replaceSettings = useCallback((next: Partial<Record<keyof UserSettings, unknown>>) => {
    setSettings((current) => {
      const merged = sanitizeSettings(next, current)
      return sameSettings(merged, current) ? current : merged
    })
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
      replaceSettings,
    }),
    [
      settings,
      setRefreshIntervalMs,
      setPreferredConsole,
      setLocale,
      setSessionTimeoutMinutes,
      replaceSettings,
    ],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
