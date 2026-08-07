import { createContext, useContext } from 'react'

export type PreferredConsole = 'vnc' | 'spice'

// Locales with a shipped catalog (see i18n/I18nProvider.tsx CATALOGS and
// i18n/locales.ts labels). 'en' is the source; the rest are translated. This
// array is the single source of truth — the type, the runtime guard
// (isLocale), and the Preferences language picker all derive from it.
export const SUPPORTED_LOCALES = [
  'en',
  'es',
  'fr',
  'de',
  'pt-BR',
  'it',
  'ru',
  'zh-CN',
  'ja',
  'ko',
  'tr',
] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

// Runtime guard for values crossing a trust boundary (localStorage, the
// language <select>): narrows an unknown to a Locale we can actually serve.
export function isLocale(value: unknown): value is Locale {
  return (SUPPORTED_LOCALES as readonly unknown[]).includes(value)
}

// Idle session timeout (minutes of inactivity before automatic logout).
// The fixed menu keeps the choice legible and bounded — no free-form entry.
export const SESSION_TIMEOUT_CHOICES = [30, 60, 120] as const
export type SessionTimeoutMinutes = (typeof SESSION_TIMEOUT_CHOICES)[number]

export function isSessionTimeout(value: unknown): value is SessionTimeoutMinutes {
  return (SESSION_TIMEOUT_CHOICES as readonly unknown[]).includes(value)
}

// Defaults double as the reset values when storage holds nothing usable.
// 10s matches the poll hooks' module constants (e.g. VM_POLL_INTERVAL_MS).
export const DEFAULT_REFRESH_INTERVAL_MS = 10_000
export const DEFAULT_PREFERRED_CONSOLE: PreferredConsole = 'vnc'
// English is the source catalog and the only locale shipped for now.
export const DEFAULT_LOCALE: Locale = 'en'
export const DEFAULT_SESSION_TIMEOUT_MINUTES: SessionTimeoutMinutes = 60

export interface SettingsContextValue {
  refreshIntervalMs: number
  setRefreshIntervalMs: (n: number) => void
  preferredConsole: PreferredConsole
  setPreferredConsole: (p: PreferredConsole) => void
  locale: Locale
  setLocale: (l: Locale) => void
  sessionTimeoutMinutes: SessionTimeoutMinutes
  setSessionTimeoutMinutes: (m: SessionTimeoutMinutes) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>')
  return value
}
