import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { useSettings } from '../settings/SettingsProvider'
import { enMessages } from './messages/en'
import { loadCatalog, peekCatalog, withEnFallback } from './catalogs'

// 'en' is the source catalog: required and exhaustive (it defines MessageId).
// The 10 translated catalogs are Partial/best-effort and code-split — see
// ./catalogs (CATALOG_LOADERS / loadCatalog) for how they are fetched.
export const DEFAULT_LOCALE = 'en'

// I18nProvider wraps react-intl's IntlProvider, sourcing the active locale
// from SettingsProvider (see settings/context.ts `locale`). It sits below
// SettingsProvider in the tree so `useSettings()` resolves.
//
// Translated catalogs load lazily: the first render of a non-en locale uses
// the en catalog (already in the entry chunk) while an effect fetches the
// locale's chunk through loadCatalog, then re-renders with that catalog merged
// over the en base (withEnFallback) — so every en id resolves in every locale
// and a missing translation renders English, never a blank. The IntlProvider
// `locale` is the selected one from the very first render, so number/date
// formatting is right while the text is still English. A catalog that fails to
// load logs once and leaves English in place; an unknown locale (no loader)
// behaves the same, so a stray setting never blanks the UI either.
//
// defaultLocale is pinned to 'en': it is the language of every default message
// passed to <FormattedMessage> / intl.formatMessage, so react-intl uses it for
// fallback formatting and treats the en catalog as authoritative.
export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = useSettings()
  // Re-render trigger only. The catalog cache in ./catalogs is the source of
  // truth — peekCatalog below reads it on every render — and this state just
  // tells React that a load has settled and the cache is worth re-reading.
  const [, setSettledCount] = useState(0)

  useEffect(() => {
    if (locale === DEFAULT_LOCALE) return
    // Stale-resolution guard: switching locale (or unmounting) before the load
    // settles cancels its effect, so neither the re-render nor the error log
    // fires for a locale nobody is looking at any more — and under
    // StrictMode's double-invoked dev effects a failure still logs exactly
    // once. A locale already in the cache resolves on the next microtask and
    // costs one cheap re-render whose memo below hits.
    let cancelled = false
    loadCatalog(locale).then(
      () => {
        if (!cancelled) setSettledCount((n) => n + 1)
      },
      (error: unknown) => {
        if (!cancelled) {
          console.error(`i18n: failed to load the '${locale}' catalog; keeping English`, error)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [locale])

  // The translated catalog for the active locale if this page has already
  // fetched it; undefined for en (nothing to merge) and while a first load is
  // in flight. Reading the cache synchronously means switching back to a
  // language loaded earlier never flashes English for a frame.
  const catalog = locale === DEFAULT_LOCALE ? undefined : peekCatalog(locale)
  // Keyed on the catalog object (one stable instance per locale in the cache)
  // so the settled re-render of an already-rendered catalog reuses the merged
  // messages and IntlProvider does not rebuild intl.
  const messages = useMemo(() => (catalog ? withEnFallback(catalog) : enMessages), [catalog])

  return (
    <IntlProvider
      locale={locale}
      defaultLocale={DEFAULT_LOCALE}
      messages={messages}
      // Because withEnFallback bakes every en id into the active catalog, a
      // MISSING_TRANSLATION here can only mean the id is absent from en too —
      // a real bug worth surfacing in every locale. The `in enMessages` guard
      // stays as belt-and-suspenders: if react-intl ever reports an id the
      // merge covers, swallow it rather than spam the console. Other error
      // codes always surface.
      onError={(error) => {
        if (error.code === 'MISSING_TRANSLATION' && 'descriptor' in error) {
          const id = error.descriptor?.id
          if (id !== undefined && String(id) in enMessages) return
        }
        console.error(error)
      }}
    >
      {children}
    </IntlProvider>
  )
}
