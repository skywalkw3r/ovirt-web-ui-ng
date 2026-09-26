import { describe, expect, it } from 'vitest'
import { en } from './messages/en'
import type { LocaleCatalog, MessageId } from './messages/en'
import { CATALOG_LOADERS, TRANSLATED_LOCALES } from './catalogs'
import type { TranslatedLocale } from './catalogs'

// The translated catalogs are code-split behind the loaders in ./catalogs and
// must never be imported statically from app code, so this suite awaits the
// same loaders the app uses (vitest resolves the dynamic imports in-process).
// Built from TRANSLATED_LOCALES, a newly registered locale is covered
// automatically.
const CATALOGS: ReadonlyArray<readonly [TranslatedLocale, LocaleCatalog]> = await Promise.all(
  TRANSLATED_LOCALES.map(async (locale) => [locale, await CATALOG_LOADERS[locale]()] as const),
)

const EN_IDS = Object.keys(en) as MessageId[]

// An id counts as translated when the catalog carries a non-blank string for
// it. An absent or explicitly-undefined entry would fall back to English at
// runtime (withEnFallback); a blank string would render nothing at all — both
// are coverage gaps.
function isTranslated(catalog: LocaleCatalog, id: MessageId): boolean {
  const message = catalog[id]
  return typeof message === 'string' && message.trim() !== ''
}

// Failure messages list the gaps so the fix is mechanical; cap the list so a
// freshly-emptied catalog does not flood the log with thousands of ids.
const MAX_LISTED_IDS = 40

describe('i18n catalog coverage', () => {
  it('loads a catalog for every translated locale', () => {
    expect(CATALOGS.map(([locale]) => locale)).toEqual([...TRANSLATED_LOCALES])
    for (const [locale, catalog] of CATALOGS) {
      expect(Object.keys(catalog).length, `${locale} catalog is empty`).toBeGreaterThan(0)
    }
  })

  // Dead-key guard: an id that no longer exists in en is dead weight and
  // usually a leftover from a renamed/removed English string — or a typo'd
  // id, which also shows up as a gap in the coverage test below.
  it('every key in every translated catalog exists in en', () => {
    for (const [locale, catalog] of CATALOGS) {
      const dead = Object.keys(catalog).filter((id) => !(id in en))
      expect(dead, `${locale} has ids that do not exist in en`).toEqual([])
    }
  })

  // Coverage is enforced, not informational: the sync rule (CLAUDE.md, i18n)
  // says every change that touches interface text lands all 10 translations
  // in the same pass, so anything short of 100% is a missed backfill. The
  // English fallback in withEnFallback is a safety net for the user, not a
  // licence to ship gaps.
  it('every translated catalog covers 100% of the en ids', () => {
    const rows = CATALOGS.map(([locale, catalog]) => {
      const missing = EN_IDS.filter((id) => !isTranslated(catalog, id))
      const translated = EN_IDS.length - missing.length
      return { locale, missing, translated, coverage: (translated / EN_IDS.length) * 100 }
    })

    const table = rows
      .map(
        ({ locale, translated, coverage }) =>
          `${locale.padEnd(6)} ${String(translated).padStart(4)}/${EN_IDS.length}  ${coverage
            .toFixed(1)
            .padStart(5)}%`,
      )
      .join('\n')
    console.log(`i18n coverage (en = ${EN_IDS.length} ids)\n${table}`)

    for (const { locale, missing } of rows) {
      const listed = missing.slice(0, MAX_LISTED_IDS).join('\n  ')
      const more =
        missing.length > MAX_LISTED_IDS ? `\n  … and ${missing.length - MAX_LISTED_IDS} more` : ''
      expect(
        missing,
        `${locale} is missing ${missing.length} of ${EN_IDS.length} en ids — add them to src/i18n/messages/${locale}.ts:\n  ${listed}${more}`,
      ).toEqual([])
    }
  })
})
