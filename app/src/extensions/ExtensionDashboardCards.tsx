import { Card, CardBody, CardHeader, CardTitle, GridItem } from '@patternfly/react-core'
import { useIntl } from 'react-intl'
import type { DashboardCardSize } from './api'
import { ExtensionBoundary } from './ExtensionBoundary'
import { useExtensionSnapshot } from './registry'
import { resolveText } from './text'
import { pluginApplies, safePredicate, useExtensionSession } from './visibility'

const SPAN: Record<DashboardCardSize, 4 | 6 | 12> = { small: 4, medium: 6, large: 12 }

// Plugin cards, appended to the dashboard grid after the built-in rows. The
// console owns the card frame and title so plugin cards line up with the
// built-in ones; the plugin renders the body.
export function ExtensionDashboardCards() {
  const snapshot = useExtensionSnapshot()
  const session = useExtensionSession()
  const { locale } = useIntl()
  const cards = snapshot.dashboardCards.filter(
    ({ plugin, contribution }) =>
      pluginApplies(plugin) &&
      safePredicate(plugin, contribution.isVisible, { session, entity: undefined }, true),
  )
  return cards.map(({ plugin, key, contribution }) => {
    const Contributed = contribution.component
    const title = resolveText(contribution.title, snapshot.catalogs[plugin], locale)
    return (
      <GridItem key={key} xl={SPAN[contribution.size ?? 'medium']}>
        <Card isFullHeight>
          <CardHeader>
            <CardTitle component="h2">{title}</CardTitle>
          </CardHeader>
          <CardBody>
            <ExtensionBoundary plugin={plugin}>
              <Contributed />
            </ExtensionBoundary>
          </CardBody>
        </Card>
      </GridItem>
    )
  })
}
