import { enMessages } from './messages/en'
import type { LocaleCatalog } from './messages/en'
import { es } from './messages/es'
import { fr } from './messages/fr'
import { de } from './messages/de'
import { ptBR } from './messages/pt-BR'
import { it } from './messages/it'
import { ru } from './messages/ru'
import { zhCN } from './messages/zh-CN'
import { ja } from './messages/ja'
import { ko } from './messages/ko'
import { tr } from './messages/tr'

// Translated message catalogs keyed by locale — everything but 'en', which is
// the exhaustive source catalog (it defines MessageId). These are Partial
// (best-effort): untranslated ids fall back to English via withEnFallback, so
// a locale can lag behind en without blanks or build breaks. Register new
// locales here plus SUPPORTED_LOCALES (settings/context.ts) and LOCALE_LABELS
// (./locales.ts).
export const CATALOGS: Record<string, LocaleCatalog> = {
  es,
  fr,
  de,
  'pt-BR': ptBR,
  it,
  ru,
  'zh-CN': zhCN,
  ja,
  ko,
  tr,
}

// Merge a (possibly partial) locale catalog over the exhaustive en catalog:
// every en id is guaranteed present, so missing translations render English —
// no blanks, no MISSING_TRANSLATION noise. Explicitly-undefined entries are
// skipped so they can't clobber the en base in the spread.
export function withEnFallback(catalog: LocaleCatalog): Record<string, string> {
  const merged: Record<string, string> = { ...enMessages }
  for (const [id, message] of Object.entries(catalog)) {
    if (message !== undefined) merged[id] = message
  }
  return merged
}
