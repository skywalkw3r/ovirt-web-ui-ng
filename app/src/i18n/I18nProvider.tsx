import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { IntlProvider } from 'react-intl'
import { useSettings } from '../settings/SettingsProvider'
import { enMessages } from './messages/en'
import { CATALOGS, withEnFallback } from './catalogs'

// 'en' is the source catalog: required and exhaustive (it defines MessageId).
// The 10 translated catalogs live in ./catalogs and are Partial/best-effort.
export const DEFAULT_LOCALE = 'en'

// I18nProvider wraps react-intl's IntlProvider, sourcing the active locale
// from SettingsProvider (see settings/context.ts `locale`). It sits below
// SettingsProvider in the tree so `useSettings()` resolves.
//
// The active catalog is always the en catalog with the locale's translations
// merged over it (withEnFallback), so every en id resolves in every locale —
// missing translations render English, never blanks. Unknown locales get the
// plain en catalog, so a stray setting never blanks the UI either.
//
// defaultLocale is pinned to 'en': it is the language of every default message
// passed to <FormattedMessage> / intl.formatMessage, so react-intl uses it for
// fallback formatting and treats the en catalog as authoritative.
export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = useSettings()
  const messages = useMemo(() => {
    const catalog = CATALOGS[locale]
    return catalog ? withEnFallback(catalog) : enMessages
  }, [locale])

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
