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
} from '@patternfly/react-core'
import type { DataCenter } from '../../api/schemas/datacenter'
import { useT } from '../../i18n/useT'
import { statusText } from '../../lib/format'

const DASH = '—'

// Render an optional string/number as-is, or an em dash when absent — the
// contract is explicit that every optional field is guarded with a — fallback.
function orDash(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
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
function formatVersion(version: DataCenter['version']): string | undefined {
  if (version === undefined) return undefined
  const { major, minor } = version
  if (major === undefined && minor === undefined) return undefined
  return `${orDash(major)}.${orDash(minor)}`
}

// The `local` boolean distinguishes a single-host local-storage data center
// from a shared one; the schema coerces the engine's "true"/"false" strings.
function storageType(local: boolean | undefined): string | undefined {
  if (local === undefined) return undefined
  return local ? 'Local' : 'Shared'
}

export function DataCenterGeneralTab({ dataCenter }: { dataCenter: DataCenter }) {
  const t = useT()
  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('dataCenterGeneral.card.general')}>
          <TextGroup term="Name" value={dataCenter.name} />
          <TextGroup term="Description" value={dataCenter.description} />
          <TextGroup term="Status" value={statusText(dataCenter.status)} />
          <TextGroup term="Compatibility version" value={formatVersion(dataCenter.version)} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('dataCenterGeneral.card.configuration')}>
          <TextGroup term="Quota mode" value={dataCenter.quota_mode} />
          <TextGroup term="Storage type" value={storageType(dataCenter.local)} />
          <TextGroup term="MAC pool" value={dataCenter.mac_pool?.name} />
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
