import { describe, expect, it, vi } from 'vitest'
import { SUPPORTED_LOCALES } from '../settings/context'
import type { Locale } from '../settings/context'
import { en } from './messages/en'
import type { LocaleCatalog } from './messages/en'
// Static imports of the translated catalogs are fine in a test (tests are not
// bundled); app code must only ever reach them through CATALOG_LOADERS.
import { es } from './messages/es'
import { fr } from './messages/fr'
import { de } from './messages/de'
import { ptBR } from './messages/pt-BR'
import { it as itCatalog } from './messages/it'
import { ru } from './messages/ru'
import { zhCN } from './messages/zh-CN'
import { ja } from './messages/ja'
import { ko } from './messages/ko'
import { tr } from './messages/tr'
import {
  CATALOG_LOADERS,
  TRANSLATED_LOCALES,
  createCatalogCache,
  loadCatalog,
  peekCatalog,
} from './catalogs'
import type { CatalogLoader, TranslatedLocale } from './catalogs'

describe('CATALOG_LOADERS', () => {
  // A locale registered in SUPPORTED_LOCALES (settings/context.ts) without a
  // loader would be selectable in Preferences yet render English forever.
  // The Record<TranslatedLocale, …> typing already fails the build for that;
  // this pins the runtime shape too (no missing and no extra entries).
  it('has exactly one loader for every non-en SUPPORTED_LOCALE', () => {
    const expected = SUPPORTED_LOCALES.filter((locale) => locale !== 'en')
    expect([...TRANSLATED_LOCALES]).toEqual(expected)
    expect(Object.keys(CATALOG_LOADERS).sort()).toEqual([...expected].sort())
    for (const locale of TRANSLATED_LOCALES) {
      expect(typeof CATALOG_LOADERS[locale], `${locale} loader`).toBe('function')
    }
  })

  // Guards the copy-paste hazard in the loader table: every loader must
  // resolve to its own module's catalog export, not a neighbour's.
  it('each loader resolves to its own locale catalog', async () => {
    const expected: Record<TranslatedLocale, LocaleCatalog> = {
      es,
      fr,
      de,
      'pt-BR': ptBR,
      it: itCatalog,
      ru,
      'zh-CN': zhCN,
      ja,
      ko,
      tr,
    }
    for (const locale of TRANSLATED_LOCALES) {
      expect(await CATALOG_LOADERS[locale](), locale).toBe(expected[locale])
    }
  })
})

describe('loadCatalog / peekCatalog (module cache)', () => {
  it("resolves the static en catalog for 'en'", async () => {
    expect(peekCatalog('en')).toBe(en)
    expect(await loadCatalog('en')).toBe(en)
  })

  it('fetches a translated catalog once and serves it from the cache afterwards', async () => {
    expect(peekCatalog('ja')).toBeUndefined()
    const first = loadCatalog('ja')
    // Same in-flight promise for a concurrent caller, same object once settled.
    expect(loadCatalog('ja')).toBe(first)
    expect(await first).toBe(ja)
    expect(await loadCatalog('ja')).toBe(ja)
    expect(peekCatalog('ja')).toBe(ja)
  })

  it('rejects a locale that has no registered loader', async () => {
    await expect(loadCatalog('zz' as Locale)).rejects.toThrow(/no catalog is registered/)
    expect(peekCatalog('zz' as Locale)).toBeUndefined()
  })
})

describe('createCatalogCache', () => {
  const panel: LocaleCatalog = { 'nav.dashboard': 'Panel' }

  it('shares one in-flight import between concurrent callers and caches the result', async () => {
    let resolve!: (catalog: LocaleCatalog) => void
    const loader = vi.fn<CatalogLoader>(
      () =>
        new Promise<LocaleCatalog>((r) => {
          resolve = r
        }),
    )
    const { load, peek } = createCatalogCache({ es: loader })

    const a = load('es')
    const b = load('es')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(b).toBe(a)
    expect(peek('es')).toBeUndefined()

    resolve(panel)
    expect(await a).toBe(panel)
    expect(peek('es')).toBe(panel)

    expect(await load('es')).toBe(panel)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('evicts a failed load so the next request retries instead of pinning English', async () => {
    const loader = vi
      .fn<CatalogLoader>()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValueOnce(panel)
    const { load, peek } = createCatalogCache({ fr: loader })

    await expect(load('fr')).rejects.toThrow('chunk 404')
    expect(peek('fr')).toBeUndefined()

    expect(await load('fr')).toBe(panel)
    expect(peek('fr')).toBe(panel)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it("never calls a loader for 'en' and keeps caches independent", async () => {
    const loader = vi.fn<CatalogLoader>(() => Promise.resolve(panel))
    const { load, peek } = createCatalogCache({ en: loader, es: loader })

    expect(await load('en')).toBe(en)
    expect(peek('en')).toBe(en)
    expect(loader).not.toHaveBeenCalled()

    // A second cache instance starts cold: nothing leaks between instances.
    await load('es')
    expect(createCatalogCache({ es: loader }).peek('es')).toBeUndefined()
  })
})
