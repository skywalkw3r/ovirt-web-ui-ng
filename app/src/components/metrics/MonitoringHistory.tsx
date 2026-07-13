import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { ChartLineIcon, ExternalLinkAltIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import type { QueryEntity } from '../../config/runtime'
import type { GrafanaStatus } from '../../hooks/useGrafanaAvailability'
import type { HistoryRange } from '../../hooks/useDwhHistory'
import { useT } from '../../i18n/useT'
import { HistoryCharts } from './HistoryCharts'

// The "History" surface of a Monitoring tab, keyed off the liveness probe:
//   checking    → skeleton
//   available   → native DWH charts (HistoryCharts owns the query states,
//                 including the "sign in to Grafana" 401 call-to-action)
//   unavailable → an info EmptyState + portal link + Retry (only reachable
//                 when the deployer forced enabled:true — under 'auto' the
//                 whole surface is hidden instead; see useGrafanaAvailability)
export function MonitoringHistory({
  status,
  grafanaBaseUrl,
  onRetry,
  entity,
  entityId,
  range,
}: {
  status: GrafanaStatus
  grafanaBaseUrl: string
  onRetry: () => void
  entity: QueryEntity
  entityId: string
  range: HistoryRange
}) {
  const t = useT()

  if (status === 'checking') {
    return <Skeleton height="6rem" screenreaderText={t('monitoring.checking')} />
  }

  if (status === 'available') {
    return <HistoryCharts entity={entity} entityId={entityId} range={range} />
  }

  // unavailable — info tone (not danger): a DWH-less deployment is expected,
  // not an error.
  return (
    <EmptyState
      titleText={t('monitoring.unavailable.title')}
      icon={ChartLineIcon}
      headingLevel="h3"
    >
      <EmptyStateBody>
        <FormattedMessage id="monitoring.unavailable.body" />
      </EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button
            variant="secondary"
            component="a"
            href={grafanaBaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            icon={<ExternalLinkAltIcon />}
            iconPosition="end"
          >
            {t('monitoring.openPortal')}
          </Button>
          <Button variant="link" onClick={onRetry}>
            {t('monitoring.retry')}
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  )
}
