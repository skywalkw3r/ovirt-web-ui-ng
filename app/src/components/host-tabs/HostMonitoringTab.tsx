import { Card, CardBody, CardHeader, CardTitle, Flex, FlexItem } from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import { useHostUsage } from '../../hooks/useHost'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'
import { busiestHostNic, hostGauges, hostLogicalCpus, type HostGauges } from '../../lib/utilization'
import { MonitoringPortalLink } from '../metrics/MonitoringPortalLink'
import { UtilizationGauge } from '../metrics/UtilizationGauge'

function memoryPercent({ memoryUsed, memoryTotal }: HostGauges): number | undefined {
  if (memoryUsed === undefined || memoryTotal === undefined || memoryTotal <= 0) return undefined
  return (memoryUsed / memoryTotal) * 100
}

// Host Monitoring tab: the host's live CPU, memory and network gauges from the
// engine REST statistics (useHostUsage), computed by the same lib/utilization
// helpers as the hosts list Usage columns so both read the same numbers. A
// host publishes no disk gauge, so there is no Disk gauge here. The parent
// Tabs use unmountOnExit, so leaving the tab stops the 30s poll.
export function HostMonitoringTab({ hostId }: { hostId: string }) {
  const t = useT()
  const usage = useHostUsage(hostId)
  const host = usage.data
  // Unlike the VM tab's sample window, every host gauge is read whole from one
  // response: once a read has settled, a gauge still missing is not coming (a
  // down or maintenance host serves no statistics; a degraded read drops the
  // NIC statistics), so it reads "not available" rather than "collecting".
  const unavailable = usage.isError || usage.isSuccess

  const gauges = host ? hostGauges(host) : undefined
  const cpus = host ? hostLogicalCpus(host) : undefined
  const nic = host ? busiestHostNic(host) : undefined

  return (
    <Card isCompact>
      <CardHeader actions={{ actions: <MonitoringPortalLink />, hasNoOffset: true }}>
        <CardTitle component="h2">
          <FormattedMessage id="monitoring.live.heading" />
        </CardTitle>
      </CardHeader>
      <CardBody>
        <Flex
          justifyContent={{ default: 'justifyContentSpaceAround' }}
          flexWrap={{ default: 'wrap' }}
          spaceItems={{ default: 'spaceItemsLg' }}
        >
          <FlexItem>
            <UtilizationGauge
              title={t('monitoring.gauge.cpu')}
              name="host-cpu-gauge"
              percent={gauges?.cpuUsedPercent}
              total={cpus !== undefined ? t('monitoring.logicalCpus', { count: cpus }) : undefined}
              unavailable={unavailable}
            />
          </FlexItem>
          <FlexItem>
            <UtilizationGauge
              title={t('monitoring.gauge.memory')}
              name="host-memory-gauge"
              percent={gauges ? memoryPercent(gauges) : undefined}
              total={
                gauges?.memoryUsed !== undefined && gauges.memoryTotal !== undefined
                  ? t('hosts.memory.measure', {
                      used: formatBytes(gauges.memoryUsed),
                      total: formatBytes(gauges.memoryTotal),
                    })
                  : undefined
              }
              unavailable={unavailable}
            />
          </FlexItem>
          <FlexItem>
            <UtilizationGauge
              title={t('monitoring.gauge.network')}
              name="host-network-gauge"
              percent={nic?.percent}
              total={nic?.name ? t('monitoring.busiestNic', { name: nic.name }) : undefined}
              unavailable={unavailable}
            />
          </FlexItem>
        </Flex>
      </CardBody>
    </Card>
  )
}
