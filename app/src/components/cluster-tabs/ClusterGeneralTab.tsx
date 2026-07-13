import type { ReactNode } from 'react'
import {
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
import type { Cluster } from '../../api/schemas/cluster'
import { useT } from '../../i18n/useT'

const DASH = '—'

// Render an optional string/number as-is, or an em dash when absent — the
// contract is explicit that every optional field is guarded with a — fallback.
function orDash(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
}

// The engine serializes booleans as JSON strings ("true"/"false"); the schema
// coerces them, so a real boolean (or undefined) reaches here. Mirrors
// NetworkGeneralTab / HostGeneralTab's BoolLabel.
function BoolLabel({ value }: { value: boolean | undefined }) {
  if (value === undefined) return <>{DASH}</>
  return (
    <Label isCompact color={value ? 'green' : 'grey'}>
      {value ? 'Yes' : 'No'}
    </Label>
  )
}

// A term whose description is a plain string (em dash when missing).
function TextGroup({ term, value }: { term: string; value: string | number | undefined | null }) {
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

// The cluster's data center, linked to the data center detail page when the
// followed link carries both id and name (getCluster follows data_center);
// falls back to the plain name, or an em dash, otherwise.
function DataCenterValue({ dataCenter }: { dataCenter: Cluster['data_center'] }) {
  if (dataCenter?.id !== undefined && dataCenter.name !== undefined) {
    return (
      <Link to="/datacenters/$dataCenterId" params={{ dataCenterId: dataCenter.id }}>
        {dataCenter.name}
      </Link>
    )
  }
  return <>{orDash(dataCenter?.name)}</>
}

// One bordered overview card: an h2 section heading over a compact two-column
// description list — mirrors the VM General tab. Page keeps its single h1.
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

// Compatibility version is major.minor; the schema coerces both from the
// engine's JSON-string form. Show it only when at least one part is present.
function formatVersion(version: Cluster['version']): string | undefined {
  if (version === undefined) return undefined
  const { major, minor } = version
  if (major === undefined && minor === undefined) return undefined
  return `${orDash(major)}.${orDash(minor)}`
}

// Memory over-commit is a percentage; the schema coerces the engine's
// JSON-string form. Render with a trailing % when present.
function formatOverCommit(percent: number | undefined): string | undefined {
  if (percent === undefined) return undefined
  return `${percent}%`
}

export function ClusterGeneralTab({ cluster }: { cluster: Cluster }) {
  const t = useT()
  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('clusterGeneral.card.general')}>
          <TextGroup term="Name" value={cluster.name} />
          <TextGroup term="Description" value={cluster.description} />
          <NodeGroup term="Data center">
            <DataCenterValue dataCenter={cluster.data_center} />
          </NodeGroup>
          <TextGroup term="CPU type" value={cluster.cpu?.type} />
          <TextGroup term="Compatibility version" value={formatVersion(cluster.version)} />
          <TextGroup term="Switch type" value={cluster.switch_type} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('clusterGeneral.card.scheduling')}>
          <TextGroup term="Scheduling policy" value={cluster.scheduling_policy?.name} />
          <TextGroup
            term="Memory over-commit"
            value={formatOverCommit(cluster.memory_policy?.over_commit?.percent)}
          />
          <DescriptionListGroup>
            <DescriptionListTerm>Ballooning</DescriptionListTerm>
            <DescriptionListDescription>
              <BoolLabel value={cluster.ballooning_enabled} />
            </DescriptionListDescription>
          </DescriptionListGroup>
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
