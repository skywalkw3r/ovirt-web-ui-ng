import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FormattedMessage } from 'react-intl'

// The vitest env is 'node' (no jsdom), and the suite has no testing-library,
// so we render to a static HTML string via react-dom/server rather than into a
// DOM. That is enough to assert the provider wires react-intl and resolves a
// <FormattedMessage> against the en catalog.
//
// I18nProvider reads the active locale from useSettings, so we stub the
// settings module to avoid mounting the real provider tree.
const setLocale = vi.fn()
let currentLocale = 'en'
vi.mock('../settings/SettingsProvider', () => ({
  useSettings: () => ({ locale: currentLocale, setLocale }),
}))

const { I18nProvider } = await import('./I18nProvider')
const { withEnFallback } = await import('./catalogs')

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

  it('resolves a registered non-English catalog', () => {
    // A shipped translation renders in its own language, not English.
    currentLocale = 'es'
    const html = renderToStaticMarkup(
      <I18nProvider>
        <FormattedMessage id="login.submit" />
      </I18nProvider>,
    )
    // 'login.submit' → 'Iniciar sesión' in messages/es.ts.
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
    // A locale with no registered catalog still renders English rather than a
    // blank string, matching the CATALOGS fallback + defaultLocale.
    currentLocale = 'zz'
    const html = renderToStaticMarkup(
      <I18nProvider>
        <FormattedMessage id="nav.dashboard" />
      </I18nProvider>,
    )
    expect(html).toContain('Dashboard')
  })
})
