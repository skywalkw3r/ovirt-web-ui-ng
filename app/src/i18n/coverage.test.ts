import { describe, expect, it } from 'vitest'
import { en } from './messages/en'
import type { LocaleCatalog } from './messages/en'
// The 10 translated catalogs (everything but en) come straight from the
// runtime registry, so a newly registered locale is covered automatically.
import { CATALOGS } from './catalogs'

const EN_KEY_COUNT = Object.keys(en).length

// Ids actually translated in a catalog: present in en (dead keys are counted
// out — the first test fails on them anyway) and not explicitly undefined.
function translatedKeys(catalog: LocaleCatalog): string[] {
  return Object.entries(catalog)
    .filter(([id, message]) => id in en && message !== undefined)
    .map(([id]) => id)
}

describe('i18n catalog coverage', () => {
  // Dead-key guard: locales are Partial (missing ids are fine — they fall
  // back to English), but an id that no longer exists in en is dead weight
  // and usually a leftover from a renamed/removed English string.
  it('every key in every non-en catalog exists in en', () => {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      const dead = Object.keys(catalog).filter((id) => !(id in en))
      expect(dead, `${locale} has ids that do not exist in en`).toEqual([])
    }
  })

  // Coverage is informational by design: locales are best-effort and lag en
  // freely (English fallback covers the gap), so the only hard assertion is
  // non-zero — a 0% locale means a broken import or an emptied catalog.
  it('reports per-locale coverage (must be > 0%)', () => {
    const rows = Object.entries(CATALOGS).map(([locale, catalog]) => {
      const translated = translatedKeys(catalog).length
      const coverage = (translated / EN_KEY_COUNT) * 100
      return { locale, translated, coverage }
    })

    const table = rows
      .map(
        ({ locale, translated, coverage }) =>
          `${locale.padEnd(6)} ${String(translated).padStart(4)}/${EN_KEY_COUNT}  ${coverage
            .toFixed(1)
            .padStart(5)}%`,
      )
      .join('\n')
    console.log(`i18n coverage (en = ${EN_KEY_COUNT} ids)\n${table}`)

    for (const { locale, coverage } of rows) {
      expect(coverage, `${locale} has zero coverage`).toBeGreaterThan(0)
    }
  })
})
