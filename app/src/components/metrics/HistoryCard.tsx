import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core'
import { useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { useRuntimeConfig, type QueryEntity } from '../../config/runtime'
import { useGrafanaAvailability } from '../../hooks/useGrafanaAvailability'
import type { HistoryRange } from '../../hooks/useDwhHistory'
import type { MessageId } from '../../i18n/messages/en'
import { useT } from '../../i18n/useT'
import { MonitoringHistory } from './MonitoringHistory'

const RANGES: { range: HistoryRange; labelId: MessageId }[] = [
  { range: '6h', labelId: 'monitoring.range.6h' },
  { range: '24h', labelId: 'monitoring.range.24h' },
  { range: '7d', labelId: 'monitoring.range.7d' },
]

// The DWH/Grafana "History" card, shared by the VM/host/cluster Monitoring
// tabs: title, time-range toggle, and the probe-gated history surface. Renders
// nothing when the entity has no query spec or the availability gate says the
// surface is hidden (mode 'off', non-admin, or 'auto' with no live Grafana) —
// callers can mount it unconditionally.
export function HistoryCard({ entity, entityId }: { entity: QueryEntity; entityId: string }) {
  const t = useT()
  const grafana = useGrafanaAvailability()
  const { monitoring } = useRuntimeConfig()
  const [range, setRange] = useState<HistoryRange>('24h')

  if (!grafana.visible || monitoring.queries[entity] === undefined) return null

  const rangePicker = (
    <ToggleGroup isCompact aria-label={t('monitoring.range.label')}>
      {RANGES.map((entry) => (
        <ToggleGroupItem
          key={entry.range}
          text={t(entry.labelId)}
          isSelected={range === entry.range}
          onChange={() => setRange(entry.range)}
        />
      ))}
    </ToggleGroup>
  )

  return (
    <Card isCompact>
      <CardHeader actions={{ actions: rangePicker, hasNoOffset: true }}>
        <CardTitle component="h2">
          <FormattedMessage id="monitoring.history.heading" />
        </CardTitle>
      </CardHeader>
      <CardBody>
        <MonitoringHistory
          status={grafana.status}
          grafanaBaseUrl={grafana.grafanaBaseUrl}
          onRetry={grafana.refetch}
          entity={entity}
          entityId={entityId}
          range={range}
        />
      </CardBody>
    </Card>
  )
}
