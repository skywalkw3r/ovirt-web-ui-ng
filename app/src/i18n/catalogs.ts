import { SUPPORTED_LOCALES } from '../settings/context'
import type { Locale } from '../settings/context'
import { en, enMessages } from './messages/en'
import type { LocaleCatalog } from './messages/en'

// 'en' is the source catalog — exhaustive, statically imported, the catalog
// every render starts from (it also defines MessageId). The 10 translated
// catalogs are ~300 kB of source each, so they sit behind the dynamic
// import() loaders below and are code-split into their own chunks, fetched
// only once a user actually selects that language. Never import a translated
// catalog statically from app code (nor re-export the set statically): a
// single static import pulls it back into the entry chunk for every user. The
// tests under src/i18n may import them freely — tests are not bundled.
export type TranslatedLocale = Exclude<Locale, 'en'>

// Every locale with a lazy catalog, in SUPPORTED_LOCALES order.
export const TRANSLATED_LOCALES: readonly TranslatedLocale[] = SUPPORTED_LOCALES.filter(
  (locale): locale is TranslatedLocale => locale !== 'en',
)

export type CatalogLoader = () => Promise<LocaleCatalog>

// One loader per translated locale. Register a new locale here plus
// SUPPORTED_LOCALES (settings/context.ts) and LOCALE_LABELS (./locales.ts).
// The Record<TranslatedLocale, …> typing fails the build for a locale added to
// SUPPORTED_LOCALES without a loader (catalogs.test.ts asserts the same at
// runtime), and the `.then((m) => m.<export>)` projection resolves to the
// catalog object itself rather than the module namespace.
export const CATALOG_LOADERS: Record<TranslatedLocale, CatalogLoader> = {
  es: () => import('./messages/es').then((m) => m.es),
  fr: () => import('./messages/fr').then((m) => m.fr),
  de: () => import('./messages/de').then((m) => m.de),
  'pt-BR': () => import('./messages/pt-BR').then((m) => m.ptBR),
  it: () => import('./messages/it').then((m) => m.it),
  ru: () => import('./messages/ru').then((m) => m.ru),
  'zh-CN': () => import('./messages/zh-CN').then((m) => m.zhCN),
  ja: () => import('./messages/ja').then((m) => m.ja),
  ko: () => import('./messages/ko').then((m) => m.ko),
  tr: () => import('./messages/tr').then((m) => m.tr),
}

export interface CatalogCache {
  // Resolve the catalog for `locale`: en straight from the static import,
  // anything else through its loader. Rejects for a locale without a loader.
  load: (locale: Locale) => Promise<LocaleCatalog>
  // The already-resolved catalog for `locale`, or undefined while it is still
  // loading or has never been requested. Lets a render use a catalog this
  // page already fetched without waiting a tick on the promise.
  peek: (locale: Locale) => LocaleCatalog | undefined
}

// Caching front over a loader map. Promises are cached per locale for the
// life of the page, so a locale's chunk is fetched once and concurrent callers
// share the in-flight import; a rejected load is evicted so the next request
// retries (chunk fetches do fail transiently — a deploy rotated the asset
// hashes, a flaky network) instead of pinning English until reload. A factory
// rather than bare module state so the caching contract is unit-testable with
// fake loaders; the app uses the single instance exported below.
export function createCatalogCache(loaders: Partial<Record<Locale, CatalogLoader>>): CatalogCache {
  const pending = new Map<Locale, Promise<LocaleCatalog>>()
  const resolved = new Map<Locale, LocaleCatalog>()

  return {
    load(locale) {
      if (locale === 'en') return Promise.resolve(en)
      const inFlight = pending.get(locale)
      if (inFlight) return inFlight
      const loader = loaders[locale]
      if (!loader) {
        return Promise.reject(new Error(`i18n: no catalog is registered for locale '${locale}'`))
      }
      const promise = loader().then(
        (catalog) => {
          resolved.set(locale, catalog)
          return catalog
        },
        (error: unknown) => {
          pending.delete(locale)
          throw error
        },
      )
      pending.set(locale, promise)
      return promise
    },
    peek(locale) {
      return locale === 'en' ? en : resolved.get(locale)
    },
  }
}

const cache = createCatalogCache(CATALOG_LOADERS)

// Module-level cache: a translated catalog is fetched once per page load.
export const loadCatalog: CatalogCache['load'] = cache.load
export const peekCatalog: CatalogCache['peek'] = cache.peek

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
