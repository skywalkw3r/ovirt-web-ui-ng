import { useMemo, type JSXElementConstructor, type ReactElement } from 'react'
import { Tab, TabContentBody, TabTitleText, type TabProps } from '@patternfly/react-core'
import { useIntl } from 'react-intl'
import type { EntityTabKind } from './api'
import { ExtensionBoundary } from './ExtensionBoundary'
import { useExtensionSnapshot } from './registry'
import { resolveText } from './text'
import { pluginApplies, safePredicate, toEntityContext, useExtensionSession } from './visibility'

// Plugin subtabs for one detail page, placed as one child at the end of the
// page's <Tabs> (`{extensionTabs}`). Event keys are `ext:<plugin>:<id>`, so
// they never collide with the page's own tabs. Call it at the top of the
// page (it is a hook); `data` is the entity once loaded, undefined before.
//
// The value is an array of <Tab> elements typed as a single Tabs child: PF
// Tabs reads its children through React.Children.toArray, which flattens a
// nested array, but its `children` type does not admit one.
export function useExtensionTabs<K extends EntityTabKind>(
  kind: K,
  data: ({ id: string; name?: string | null } & object) | undefined,
): ReactElement<TabProps, JSXElementConstructor<TabProps>> {
  const snapshot = useExtensionSnapshot()
  const session = useExtensionSession()
  const { locale } = useIntl()

  const tabs = useMemo(() => {
    if (data === undefined) return []
    const entity = toEntityContext(kind, data)
    return snapshot.entityTabs
      .filter(({ plugin, contribution }) => contribution.entity === kind && pluginApplies(plugin))
      .filter(({ plugin, contribution }) =>
        safePredicate(plugin, contribution.isVisible, { session, entity }, true),
      )
      .map(({ plugin, key, contribution }) => {
        const Contributed = contribution.component
        return (
          <Tab
            key={key}
            eventKey={`ext:${key}`}
            title={
              <TabTitleText>
                {resolveText(contribution.title, snapshot.catalogs[plugin], locale)}
              </TabTitleText>
            }
          >
            <TabContentBody hasPadding>
              <ExtensionBoundary plugin={plugin}>
                <Contributed entity={entity} />
              </ExtensionBoundary>
            </TabContentBody>
          </Tab>
        )
      })
  }, [data, kind, locale, session, snapshot])
  return tabs as unknown as ReactElement<TabProps, JSXElementConstructor<TabProps>>
}
