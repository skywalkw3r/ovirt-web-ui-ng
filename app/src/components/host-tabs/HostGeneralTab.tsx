import type { ReactNode } from 'react'
import {
  Alert,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
  Label,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import type { Host } from '../../api/schemas/host'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'

const DASH = '—'

// Render an optional string/number as-is, or an em dash when absent — the
// contract is explicit that a missing field is never left blank.
function orDash(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
}

// spm.status is either { state } or a bare string on older engines (see
// HostSchema) — flatten both to the state token.
function spmState(host: Host): string | undefined {
  const status = host.spm?.status
  if (typeof status === 'string') return status
  return status?.state
}

function BoolLabel({ value }: { value: boolean | undefined }) {
  const t = useT()
  if (value === undefined) return <>{DASH}</>
  return (
    <Label isCompact color={value ? 'green' : 'grey'}>
      {value ? t('common.enabled') : t('common.disabled')}
    </Label>
  )
}

// A term whose description is a plain string (em dash when missing).
function TextGroup({ term, value }: { term: string; value: string | number | undefined }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{orDash(value)}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// A term whose description is arbitrary content — a link, a label, etc.
function NodeGroup({ term, children }: { term: string; children: ReactNode }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// The host's cluster, linked to the cluster detail page when the followed
// cluster carries both id and name (getHost follows the cluster link); falls
// back to the plain name, or an em dash, otherwise.
function ClusterValue({ cluster }: { cluster: Host['cluster'] }) {
  if (cluster?.id !== undefined && cluster.name !== undefined) {
    return (
      <Link to="/clusters/$clusterId" params={{ clusterId: cluster.id }}>
        {cluster.name}
      </Link>
    )
  }
  return <>{orDash(cluster?.name)}</>
}

// One bordered overview card: an h2 section heading over a compact two-column
// description list — mirrors the VM General tab so every detail page reads the
// same way. Page keeps its single h1; each card contributes an h2.
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card isCompact isFullHeight>
      <CardTitle component="h2">{title}</CardTitle>
      <CardBody>
        <DescriptionList isCompact columnModifier={{ default: '1Col', md: '2Col' }}>
          {children}
        </DescriptionList>
      </CardBody>
    </Card>
  )
}

export function HostGeneralTab({ host }: { host: Host }) {
  const t = useT()
  const topology = host.cpu?.topology
  // Online (online) cores = sockets * cores-per-socket when the topology is
  // reported; the engine has no separate "online cores" scalar in this slice.
  const logicalCores =
    topology?.sockets !== undefined && topology.cores !== undefined
      ? topology.sockets * topology.cores
      : undefined

  const active = host.summary?.active
  const total = host.summary?.total

  const hostedEngine = host.hosted_engine
  const hostedEngineHa =
    hostedEngine?.active === undefined
      ? DASH
      : hostedEngine.active
        ? t('hostGeneral.hostedEngine.activeScore', { score: orDash(hostedEngine.score) })
        : t('hostGeneral.hostedEngine.down')

  // webadmin surfaces an "action items" callout when power management is not
  // configured; this slice has no PM sub-resource, so the hosted-engine agent
  // being unconfigured is the analogous "needs attention" signal.
  const powerManagementUnconfigured = hostedEngine?.configured === false

  return (
    <>
      {powerManagementUnconfigured && (
        <Alert
          isInline
          variant="warning"
          title={t('hostGeneral.pm.alert.title')}
          style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
        >
          {t('hostGeneral.pm.alert.body')}
        </Alert>
      )}

      {/* Cockpit (the host's local web console at :9090) moved to a link tab in
          the host detail tab bar — see HostDetailPage. */}
      <Grid hasGutter>
        <GridItem lg={6}>
          <SectionCard title={t('hostGeneral.card.general')}>
            <TextGroup term={t('hosts.column.address')} value={host.address ?? host.name} />
            <NodeGroup term={t('common.field.cluster')}>
              <ClusterValue cluster={host.cluster} />
            </NodeGroup>
            <TextGroup term={t('hostGeneral.field.spmPriority')} value={host.spm?.priority} />
            <TextGroup term={t('hostGeneral.field.spmStatus')} value={spmState(host)} />
            <TextGroup term={t('hostGeneral.field.kdumpStatus')} value={host.kdump_status} />
            <DescriptionListGroup>
              <DescriptionListTerm>{t('hostGeneral.field.activeTotalVms')}</DescriptionListTerm>
              <DescriptionListDescription>
                {active === undefined && total === undefined
                  ? DASH
                  : `${orDash(active)} / ${orDash(total)}`}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <TextGroup term={t('hostGeneral.field.selinuxMode')} value={host.se_linux?.mode} />
            <DescriptionListGroup>
              <DescriptionListTerm>{t('hostGeneral.field.devicePassthrough')}</DescriptionListTerm>
              <DescriptionListDescription>
                <BoolLabel value={host.device_passthrough?.enabled} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <TextGroup term={t('hostGeneral.field.hostedEngineHa')} value={hostedEngineHa} />
          </SectionCard>
        </GridItem>

        <GridItem lg={6}>
          <SectionCard title={t('hostGeneral.card.capacity')}>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('hostGeneral.field.physicalMemory')}</DescriptionListTerm>
              <DescriptionListDescription>{formatBytes(host.memory)}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>
                {t('hostGeneral.field.maxSchedulingMemory')}
              </DescriptionListTerm>
              <DescriptionListDescription>
                {formatBytes(host.max_scheduling_memory)}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <TextGroup term={t('hostGeneral.field.logicalCpuCores')} value={logicalCores} />
            <TextGroup term={t('hostGeneral.field.onlineCpuCores')} value={logicalCores} />
          </SectionCard>
        </GridItem>

        <GridItem lg={6}>
          <SectionCard title={t('hostGeneral.card.hardware')}>
            <TextGroup
              term={t('hostGeneral.field.manufacturer')}
              value={host.hardware_information?.manufacturer}
            />
            <TextGroup
              term={t('hostGeneral.field.family')}
              value={host.hardware_information?.family}
            />
            <TextGroup
              term={t('hostGeneral.field.productName')}
              value={host.hardware_information?.product_name}
            />
            <TextGroup
              term={t('hostGeneral.field.version')}
              value={host.hardware_information?.version}
            />
            <TextGroup term={t('hostGeneral.field.uuid')} value={host.hardware_information?.uuid} />
            <TextGroup
              term={t('hostGeneral.field.serialNumber')}
              value={host.hardware_information?.serial_number}
            />
            <TextGroup term={t('hostGeneral.field.cpuModelName')} value={host.cpu?.name} />
            <TextGroup term={t('hostGeneral.field.cpuType')} value={host.cpu?.type} />
            <TextGroup term={t('hostGeneral.field.sockets')} value={topology?.sockets} />
            <TextGroup term={t('hostGeneral.field.coresPerSocket')} value={topology?.cores} />
            <TextGroup term={t('hostGeneral.field.threadsPerCore')} value={topology?.threads} />
          </SectionCard>
        </GridItem>

        <GridItem lg={6}>
          <SectionCard title={t('hostGeneral.card.software')}>
            <TextGroup term={t('hostGeneral.field.operatingSystem')} value={host.os?.type} />
            <TextGroup term={t('hosts.column.os')} value={host.os?.version?.full_version} />
            <TextGroup
              term={t('hostGeneral.field.vdsmVersion')}
              value={host.version?.full_version}
            />
          </SectionCard>
        </GridItem>
      </Grid>
    </>
  )
}
