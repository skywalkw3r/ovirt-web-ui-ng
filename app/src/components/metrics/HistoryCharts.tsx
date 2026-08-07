import {
  Chart,
  ChartAxis,
  ChartGroup,
  ChartLegend,
  ChartLine,
  ChartThemeColor,
  ChartVoronoiContainer,
} from '@patternfly/react-charts/victory'
import {
  Button,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Gallery,
  Skeleton,
} from '@patternfly/react-core'
import { ChartLineIcon, ExternalLinkAltIcon, LockIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import { GrafanaAuthError, type DwhChart } from '../../api/grafana-query'
import { useRuntimeConfig, type QueryEntity } from '../../config/runtime'
import { useDwhHistory, type HistoryRange } from '../../hooks/useDwhHistory'
import { rebase } from '../../servers/registry'
import { useT } from '../../i18n/useT'

const CHART_HEIGHT = 230
const CHART_WIDTH = 560
// Victory's default label/line colors are dark (built for light backgrounds);
// pin them to theme-adaptive PF vars so axes + legend read in dark mode too.
const AXIS_TEXT = 'var(--pf-t--global--text--color--regular)'
const AXIS_LINE = 'var(--pf-t--global--border--color--default)'

function timeTick(value: number | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function HistoryChart({ chart }: { chart: DwhChart }) {
  // gauge-type panels are a single number, not a series
  if (!chart.time) {
    return (
      <Card isCompact isFullHeight>
        <CardTitle component="h3">{chart.title}</CardTitle>
        <CardBody>
          <div style={{ fontSize: '2rem' }}>
            {chart.value === undefined ? '—' : `${Math.round(chart.value)}%`}
          </div>
        </CardBody>
      </Card>
    )
  }
  const series = chart.series.filter((entry) => entry.points.length > 0)
  return (
    <Card isCompact isFullHeight>
      <CardTitle component="h3">{chart.title}</CardTitle>
      <CardBody>
        {series.length === 0 ? (
          <div style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>no data in range</div>
        ) : (
          <div style={{ height: `${CHART_HEIGHT}px`, maxWidth: '100%' }}>
            <Chart
              ariaTitle={chart.title}
              ariaDesc={`${chart.title} history`}
              height={CHART_HEIGHT}
              width={CHART_WIDTH}
              padding={{ top: 12, right: 24, bottom: 56, left: 56 }}
              themeColor={ChartThemeColor.multiOrdered}
              scale={{ x: 'time' }}
              legendData={series.map((entry) => ({ name: entry.name }))}
              legendPosition="bottom-left"
              legendOrientation="horizontal"
              legendComponent={<ChartLegend style={{ labels: { fill: AXIS_TEXT } }} />}
              containerComponent={
                <ChartVoronoiContainer
                  constrainToVisibleArea
                  labels={({ datum }: { datum: { y: number } }) =>
                    `${Math.round(datum.y * 100) / 100}`
                  }
                />
              }
            >
              <ChartAxis
                tickCount={4}
                tickFormat={timeTick}
                style={{
                  tickLabels: { fill: AXIS_TEXT },
                  axis: { stroke: AXIS_LINE },
                  ticks: { stroke: AXIS_LINE },
                }}
              />
              <ChartAxis
                dependentAxis
                showGrid
                tickCount={4}
                style={{
                  tickLabels: { fill: AXIS_TEXT },
                  axis: { stroke: AXIS_LINE },
                  grid: { stroke: AXIS_LINE },
                }}
              />
              <ChartGroup>
                {series.map((entry) => (
                  <ChartLine
                    key={entry.name}
                    name={entry.name}
                    data={entry.points.map((point) => ({ x: new Date(point.x), y: point.y }))}
                    interpolation="monotoneX"
                  />
                ))}
              </ChartGroup>
            </Chart>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// Native "History" charts: DWH data queried straight from Grafana's
// /api/ds/query and drawn with our own charts. Honors the four states, plus a
// distinct "sign in to Grafana" state — Grafana's session is separate from the
// engine SPA's bearer token, so a first-ever visit answers 401 until the user
// signs in to the portal top-level once (the query refetches on window focus,
// so coming back from that tab picks the charts up automatically).
export function HistoryCharts({
  entity,
  entityId,
  range,
}: {
  entity: QueryEntity
  entityId: string
  range: HistoryRange
}) {
  const t = useT()
  const { monitoring } = useRuntimeConfig()
  const { query } = useDwhHistory(entity, entityId, range)

  if (query.isPending) {
    // Four states: the pending state is Skeleton (the house data-view idiom),
    // shaped like the charts Gallery below rather than a bare centered spinner.
    return (
      <Gallery hasGutter minWidths={{ default: '440px' }}>
        <Skeleton height={`${CHART_HEIGHT}px`} screenreaderText={t('monitoring.checking')} />
        <Skeleton height={`${CHART_HEIGHT}px`} />
      </Gallery>
    )
  }
  if (query.isError && query.error instanceof GrafanaAuthError) {
    return (
      <EmptyState titleText={t('monitoring.signin.title')} icon={LockIcon} headingLevel="h3">
        <EmptyStateBody>
          <FormattedMessage id="monitoring.signin.body" />
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button
              variant="primary"
              component="a"
              href={rebase(monitoring.grafanaBaseUrl)}
              target="_blank"
              rel="noopener noreferrer"
              icon={<ExternalLinkAltIcon />}
              iconPosition="end"
            >
              {t('monitoring.openPortal')}
            </Button>
            <Button variant="link" onClick={() => void query.refetch()}>
              {t('monitoring.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }
  if (query.isError) {
    return (
      <EmptyState
        titleText={t('monitoring.unavailable.title')}
        icon={ChartLineIcon}
        headingLevel="h3"
        status="danger"
      >
        <EmptyStateBody>
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="secondary" onClick={() => void query.refetch()}>
              {t('monitoring.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }
  const charts = query.data ?? []
  if (charts.length === 0) {
    return (
      <EmptyState
        titleText={t('monitoring.history.empty')}
        icon={ChartLineIcon}
        headingLevel="h3"
      />
    )
  }
  return (
    <Gallery hasGutter minWidths={{ default: '440px' }}>
      {charts.map((chart) => (
        <HistoryChart key={chart.panelId} chart={chart} />
      ))}
    </Gallery>
  )
}
