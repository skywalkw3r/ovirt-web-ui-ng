import type { ExtensionText } from './api'
import type { Catalogs } from './registry'

type Values = Readonly<Record<string, string | number>>

// Plugin message lookup: the active locale, then its language ('pt' for
// 'pt-BR'), then 'en', then the id itself (so a missing translation shows
// something a developer can grep for, never a blank).
export function lookupMessage(catalogs: Catalogs | undefined, locale: string, id: string): string {
  const language = locale.split('-')[0]
  return catalogs?.[locale]?.[id] ?? catalogs?.[language]?.[id] ?? catalogs?.en?.[id] ?? id
}

// '{name}' placeholders only. A placeholder with no value stays verbatim,
// which makes a missing value visible instead of silently dropping text.
export function interpolate(message: string, values: Values | undefined): string {
  if (values === undefined) return message
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  )
}

export function formatPluginMessage(
  catalogs: Catalogs | undefined,
  locale: string,
  id: string,
  values?: Values,
): string {
  return interpolate(lookupMessage(catalogs, locale, id), values)
}

// Resolve a contribution's title/label for display. Anything that is
// neither a string nor a message reference renders empty rather than
// throwing inside a host menu.
export function resolveText(
  text: ExtensionText,
  catalogs: Catalogs | undefined,
  locale: string,
): string {
  if (typeof text === 'string') return text
  if (typeof text === 'object' && text !== null && typeof text.messageId === 'string') {
    return formatPluginMessage(catalogs, locale, text.messageId, text.values)
  }
  return ''
}
