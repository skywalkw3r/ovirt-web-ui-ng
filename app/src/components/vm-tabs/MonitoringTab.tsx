import { Card, CardBody, CardHeader, CardTitle, Flex, FlexItem } from '@patternfly/react-core'
import { FormattedMessage } from 'react-intl'
import type { Vm } from '../../api/schemas/vm'
import { useVmStatistics, type UtilizationSample } from '../../hooks/useVmStatistics'
import { useVmDisks } from '../../hooks/useVmStorage'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { formatBytes } from '../../lib/format'
import { MonitoringPortalLink } from '../metrics/MonitoringPortalLink'
import { UtilizationGauge } from '../metrics/UtilizationGauge'

type Metric = 'cpu' | 'memory' | 'network' | 'disk'

const GAUGES: { titleId: MessageId; name: string; metric: Metric }[] = [
  { titleId: 'monitoring.gauge.cpu', name: 'cpu-gauge', metric: 'cpu' },
  { titleId: 'monitoring.gauge.memory', name: 'memory-gauge', metric: 'memory' },
  { titleId: 'monitoring.gauge.network', name: 'network-gauge', metric: 'network' },
  { titleId: 'monitoring.gauge.disk', name: 'disk-gauge', metric: 'disk' },
]

// Most-recent reading for a metric across the sample window — a gauge shows the
// current value, not the trend, so it takes the latest defined sample.
function latest(samples: UtilizationSample[], metric: Metric): number | undefined {
  for (let i = samples.length - 1; i >= 0; i--) {
    const value = samples[i][metric]
    if (value !== undefined) return value
  }
  return undefined
}

// Monitoring tab: live utilization as current-value gauges, straight from the
// engine REST statistics (no external dependency), with the Monitoring Portal
// link in the card header for history in Grafana. Like GeneralTab's Compute
// card, this owns the statistics polling; the parent Tabs use unmountOnExit,
// so leaving the tab unmounts this and stops the poll.
export function MonitoringTab({ vm }: { vm: Vm }) {
  const t = useT()
  const { query, samples } = useVmStatistics(vm.id)
  const disks = useVmDisks(vm.id)
  const unavailable = query.isError

  // Configured capacity captions under each gauge — the VM's specs. CPU is the
  // vCPU count from its topology (sockets × cores × threads; the engine omits
  // legs equal to 1); memory is the defined memory; disk is the sum of attached
  // disks' provisioned size. Network has no fixed total. Each is omitted until
  // its source is known.
  const topology = vm.cpu?.topology
  const vcpu = topology
    ? (topology.sockets ?? 1) * (topology.cores ?? 1) * (topology.threads ?? 1)
    : undefined
  const diskBytes = disks.isSuccess
    ? disks.data.reduce((sum, attachment) => sum + (attachment.disk?.provisioned_size ?? 0), 0)
    : undefined
  const totals: Record<Metric, string | undefined> = {
    cpu: vcpu !== undefined ? t('monitoring.vcpu', { count: vcpu }) : undefined,
    memory: vm.memory !== undefined ? formatBytes(vm.memory) : undefined,
    network: undefined,
    disk: diskBytes ? formatBytes(diskBytes) : undefined,
  }

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
          {GAUGES.map((gauge) => (
            <FlexItem key={gauge.metric}>
              <UtilizationGauge
                title={t(gauge.titleId)}
                name={gauge.name}
                percent={latest(samples, gauge.metric)}
                total={totals[gauge.metric]}
                unavailable={unavailable}
              />
            </FlexItem>
          ))}
        </Flex>
      </CardBody>
    </Card>
  )
}
