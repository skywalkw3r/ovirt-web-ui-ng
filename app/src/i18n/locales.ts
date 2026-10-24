import type { Locale } from '../settings/context'

// Native-language display names for the Preferences language picker. Each
// locale is shown in its own script (endonym) so a user who can't read the
// current UI language can still find theirs. Keys must stay in sync with
// SUPPORTED_LOCALES (settings/context.ts); the Record<Locale, string> typing
// fails the build if one drifts.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  'pt-BR': 'Português (Brasil)',
  it: 'Italiano',
  ru: 'Русский',
  'zh-CN': '简体中文',
  ja: '日本語',
  ko: '한국어',
  tr: 'Türkçe',
}
