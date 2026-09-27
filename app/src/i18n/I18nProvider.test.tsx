import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FormattedMessage, FormattedNumber } from 'react-intl'

// The vitest env is 'node' (no jsdom), and the suite has no testing-library,
// so we render to a static HTML string via react-dom/server rather than into a
// DOM. That covers the synchronous contract — the provider wires react-intl,
// resolves <FormattedMessage> against the en catalog on first paint and
// against a translated catalog once it is in the cache — but effects never run
// in a static render, so the effect-driven load itself is exercised through
// loadCatalog here and the caching contract in catalogs.test.ts.
//
// I18nProvider reads the active locale from useSettings, so we stub the
// settings module to avoid mounting the real provider tree.
const setLocale = vi.fn()
let currentLocale = 'en'
vi.mock('../settings/SettingsProvider', () => ({
  useSettings: () => ({ locale: currentLocale, setLocale }),
}))

const { I18nProvider } = await import('./I18nProvider')
const { loadCatalog, withEnFallback } = await import('./catalogs')

describe('I18nProvider', () => {
  it('resolves a FormattedMessage from the en catalog', () => {
    currentLocale = 'en'
    const html = renderToStaticMarkup(
      <I18nProvider>
        <FormattedMessage id="login.submit" />
      </I18nProvider>,
    )
    // 'login.submit' → 'Sign in' in messages/en.ts.
    expect(html).toContain('Sign in')
  })

  it('renders English on first paint for a translated locale, formatted in that locale', () => {
    // Translated catalogs are code-split: until loadCatalog settles (from an
    // effect, so never inside a static render) text comes from the en catalog
    // — no blank, no MISSING_TRANSLATION — while the IntlProvider locale is
    // already the selected one, so number/date formatting is right at once.
    // 'de' is never loaded elsewhere in this file, so its cache stays cold.
    currentLocale = 'de'
    const html = renderToStaticMarkup(
      <I18nProvider>
        <FormattedMessage id="login.submit" />
        <FormattedNumber value={1234.5} />
      </I18nProvider>,
    )
    expect(html).toContain('Sign in')
    expect(html).toContain('1.234,5')
  })

  it('renders a translated catalog once it has loaded', async () => {
    // What the settled re-render shows: 'login.submit' → 'Iniciar sesión' in
    // messages/es.ts …
    const merged = withEnFallback(await loadCatalog('es'))
    expect(merged['login.submit']).toContain('Iniciar sesi')
    // … and, with the es catalog now in the module cache, a render for 'es'
    // picks it up synchronously (peekCatalog), so switching back to a language
    // loaded earlier never flashes English.
    currentLocale = 'es'
    const html = renderToStaticMarkup(
      <I18nProvider>
        <FormattedMessage id="login.submit" />
      </I18nProvider>,
    )
    expect(html).toContain('Iniciar sesi')
  })

  it('merges partial catalogs over the en base (missing ids render English)', () => {
    // Locale catalogs are Partial<Record<MessageId, string>>: withEnFallback
    // guarantees every en id resolves — translated where available, English
    // otherwise — and an explicitly-undefined entry can't blank the en base.
    const merged = withEnFallback({
      'login.submit': 'Iniciar sesión',
      'nav.dashboard': undefined,
    })
    expect(merged['login.submit']).toBe('Iniciar sesión')
    expect(merged['nav.dashboard']).toBe('Dashboard')
    expect(merged['viewState.loading']).toBe('Loading')
  })

  it('falls back to the en catalog for an unknown locale', () => {
    // A locale with no registered loader still renders English rather than a
    // blank string: nothing is ever in the cache for it, and the effect's
    // rejected load only logs.
    currentLocale = 'zz'
    const html = renderToStaticMarkup(
      <I18nProvider>
        <FormattedMessage id="nav.dashboard" />
      </I18nProvider>,
    )
    expect(html).toContain('Dashboard')
  })
})
