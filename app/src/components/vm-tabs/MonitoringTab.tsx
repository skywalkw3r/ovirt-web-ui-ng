import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Flex,
  FlexItem,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { ExternalLinkAltIcon } from '@patternfly/react-icons'
import { FormattedMessage } from 'react-intl'
import type { Vm } from '../../api/schemas/vm'
import { useGrafanaAvailability } from '../../hooks/useGrafanaAvailability'
import { useVmStatistics, type UtilizationSample } from '../../hooks/useVmStatistics'
import { useVmDisks } from '../../hooks/useVmStorage'
import { useT } from '../../i18n/useT'
import type { MessageId } from '../../i18n/messages/en'
import { formatBytes } from '../../lib/format'
import { HistoryCard } from '../metrics/HistoryCard'
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

// Monitoring tab: live utilization (rung 1) as current-value gauges — always
// available, no external dependency — plus a DWH/Grafana history surface that
// degrades gracefully when Grafana is disabled or unreachable. Like GeneralTab's
// Compute card, this owns the statistics polling; the parent Tabs use
// unmountOnExit, so leaving the tab unmounts this and stops the poll.
export function MonitoringTab({ vm }: { vm: Vm }) {
  const t = useT()
  const { query, samples } = useVmStatistics(vm.id)
  const disks = useVmDisks(vm.id)
  const grafana = useGrafanaAvailability()
  const unavailable = query.isError

  // When Grafana is reachable, surface the "open the full portal" escape hatch
  // in the utilization card header (top-right) so it's reachable without
  // scrolling past the history charts. Gated on the same signal that renders
  // the history card below.
  const portalLink = grafana.visible ? (
    <Button
      variant="link"
      component="a"
      href={grafana.grafanaBaseUrl}
      target="_blank"
      rel="noopener noreferrer"
      icon={<ExternalLinkAltIcon />}
      iconPosition="end"
      isInline
    >
      {t('monitoring.openPortal')}
    </Button>
  ) : undefined

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
    <Stack hasGutter>
      <StackItem>
        <Card isCompact>
          <CardHeader actions={portalLink ? { actions: portalLink, hasNoOffset: true } : undefined}>
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
      </StackItem>
      {grafana.visible && (
        <StackItem>
          <HistoryCard entity="vm" entityId={vm.id} />
        </StackItem>
      )}
    </Stack>
  )
}
