import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMemo } from 'react'
import { FormattedMessage } from 'react-intl'
import type { Host } from '../../api/schemas/host'
import { useHostsUsage } from '../../hooks/useHosts'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import {
  aggregateCpuCapacity,
  aggregateMemory,
  hostGauges,
  hostNetworkPercent,
  usedPercent,
} from '../../lib/utilization'
import { HostStatusLabel } from '../HostStatusLabel'
import { UsageBar } from '../HostListCells'
import { MonitoringPortalLink } from '../metrics/MonitoringPortalLink'
import { UtilizationGauge } from '../metrics/UtilizationGauge'

const STAT_VALUE = {
  fontSize: 'var(--pf-t--global--font--size--2xl)',
  fontWeight: 'var(--pf-t--global--font--weight--heading--default)',
  textAlign: 'center',
} as const
const SUBTLE_CAPTION = {
  textAlign: 'center',
  color: 'var(--pf-t--global--text--color--subtle)',
  fontSize: 'var(--pf-t--global--font--size--sm)',
} as const

function memoryPercentOf(host: Host): number | undefined {
  const { memoryUsed, memoryTotal } = hostGauges(host)
  if (memoryUsed === undefined || memoryTotal === undefined || memoryTotal <= 0) return undefined
  return (memoryUsed / memoryTotal) * 100
}

// Cluster Monitoring tab: the cluster's live CPU and memory (aggregated over
// its hosts with the same lib/utilization helpers as the Dashboard tiles),
// how many hosts are reporting, and a per-host breakdown so one hot host is
// not hidden inside the average. Reads the hosts usage list (shared cache
// with the hosts list page) and filters on the host's cluster back-link,
// the same client-side join ClusterHostsTab uses.
export function ClusterMonitoringTab({ clusterId }: { clusterId: string }) {
  const t = useT()
  const usage = useHostsUsage()
  const hosts = useMemo(
    () => (usage.data ?? []).filter((host) => host.cluster?.id === clusterId),
    [usage.data, clusterId],
  )
  const cpu = useMemo(() => aggregateCpuCapacity(hosts), [hosts])
  const memory = useMemo(() => aggregateMemory(hosts), [hosts])

  if (usage.isPending) {
    return (
      <Stack hasGutter>
        <Skeleton height="12rem" screenreaderText={t('monitoring.loading')} />
        <Skeleton height="8rem" />
      </Stack>
    )
  }

  if (usage.isError) {
    return (
      <EmptyState titleText={t('dashboard.metric.hostsError')} status="danger">
        <EmptyStateBody>
          {usage.error instanceof Error ? usage.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void usage.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (hosts.length === 0) {
    return (
      <EmptyState titleText={t('hosts.empty.title')}>
        <EmptyStateBody>{t('clusterHosts.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  const reporting = cpu?.reportingHosts ?? 0
  const notReporting = hosts.length - reporting

  return (
    <Stack hasGutter>
      <StackItem>
        <Card isCompact>
          <CardHeader actions={{ actions: <MonitoringPortalLink />, hasNoOffset: true }}>
            <CardTitle component="h2">
              <FormattedMessage id="monitoring.live.heading" />
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Flex
              justifyContent={{ default: 'justifyContentSpaceAround' }}
              alignItems={{ default: 'alignItemsCenter' }}
              flexWrap={{ default: 'wrap' }}
              spaceItems={{ default: 'spaceItemsLg' }}
            >
              <FlexItem>
                <UtilizationGauge
                  title={t('monitoring.gauge.cpu')}
                  name="cluster-cpu-gauge"
                  percent={cpu?.usedPercent}
                  total={cpu ? t('clusterMonitoring.cpuCaption', { count: reporting }) : undefined}
                  unavailable
                />
              </FlexItem>
              <FlexItem>
                <UtilizationGauge
                  title={t('monitoring.gauge.memory')}
                  name="cluster-memory-gauge"
                  percent={memory ? usedPercent(memory) : undefined}
                  total={
                    memory
                      ? t('hosts.memory.measure', {
                          used: formatBytes(memory.used),
                          total: formatBytes(memory.total),
                        })
                      : undefined
                  }
                  unavailable
                />
              </FlexItem>
              <FlexItem>
                <div
                  style={{
                    textAlign: 'center',
                    fontWeight: 'var(--pf-t--global--font--weight--body--bold)',
                  }}
                >
                  {t('clusterMonitoring.hostsReporting')}
                </div>
                <div style={STAT_VALUE}>
                  {t('clusterMonitoring.reportingValue', { reporting, total: hosts.length })}
                </div>
                {notReporting > 0 && (
                  <div style={SUBTLE_CAPTION}>
                    {t('clusterMonitoring.notReporting', { count: notReporting })}
                  </div>
                )}
              </FlexItem>
            </Flex>
          </CardBody>
        </Card>
      </StackItem>
      <StackItem>
        <Card isCompact>
          <CardTitle component="h2">{t('clusterMonitoring.hosts.title')}</CardTitle>
          <CardBody>
            <Table aria-label={t('clusterMonitoring.hosts.ariaLabel')} variant="compact">
              <Thead>
                <Tr>
                  <Th width={40}>{t('common.field.name')}</Th>
                  <Th>{t('hosts.column.cpu')}</Th>
                  <Th>{t('hosts.column.memory')}</Th>
                  <Th>{t('hosts.column.network')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {hosts.map((host) => (
                  <HostUsageRow key={host.id} host={host} />
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  )
}

function HostUsageRow({ host }: { host: Host }) {
  const t = useT()
  const cpu = hostGauges(host).cpuUsedPercent
  const memory = memoryPercentOf(host)
  const network = hostNetworkPercent(host)
  const notReporting = (
    <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
      {t('monitoring.notReporting')}
    </span>
  )
  return (
    <Tr>
      <Td dataLabel={t('common.field.name')}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--pf-t--global--spacer--md)',
          }}
        >
          <Link to="/hosts/$hostId" params={{ hostId: host.id }}>
            {host.name}
          </Link>
          <HostStatusLabel status={host.status} />
        </span>
      </Td>
      <Td dataLabel={t('hosts.column.cpu')}>
        {cpu === undefined ? (
          notReporting
        ) : (
          <UsageBar percent={cpu} ariaLabel={t('hosts.usage.cpu', { name: host.name })} />
        )}
      </Td>
      <Td dataLabel={t('hosts.column.memory')}>
        {memory === undefined ? (
          notReporting
        ) : (
          <UsageBar percent={memory} ariaLabel={t('hosts.usage.memory', { name: host.name })} />
        )}
      </Td>
      <Td dataLabel={t('hosts.column.network')}>
        {network === undefined ? (
          notReporting
        ) : (
          <UsageBar percent={network} ariaLabel={t('hosts.usage.network', { name: host.name })} />
        )}
      </Td>
    </Tr>
  )
}
