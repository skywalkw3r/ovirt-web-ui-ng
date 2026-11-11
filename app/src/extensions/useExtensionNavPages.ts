import { useMemo } from 'react'
import { useIntl } from 'react-intl'
import type { NavPageContribution } from './api'
import { useExtensionSnapshot, type Registered } from './registry'
import { resolveText } from './text'
import { pluginApplies, safePredicate, useExtensionSession } from './visibility'

export interface ResolvedNavPage {
  key: string
  plugin: string
  pageId: string
  title: string
  registered: Registered<NavPageContribution>
}

// The plugin pages this session may see, in registration order, with their
// titles in the active locale. Used by the sidebar's Extensions group and by
// the /extensions/$pluginName/$pageId route.
export function useExtensionNavPages(): ResolvedNavPage[] {
  const snapshot = useExtensionSnapshot()
  const session = useExtensionSession()
  const { locale } = useIntl()
  return useMemo(
    () =>
      snapshot.navPages
        .filter(({ plugin }) => pluginApplies(plugin))
        .filter(({ plugin, contribution }) =>
          safePredicate(plugin, contribution.isVisible, { session, entity: undefined }, true),
        )
        .map((registered) => ({
          key: registered.key,
          plugin: registered.plugin,
          pageId: registered.contribution.id,
          title: resolveText(
            registered.contribution.title,
            snapshot.catalogs[registered.plugin],
            locale,
          ),
          registered,
        })),
    [locale, session, snapshot],
  )
}
