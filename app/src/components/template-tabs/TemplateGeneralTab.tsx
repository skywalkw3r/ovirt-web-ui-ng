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
import type { Template } from '../../api/schemas/template'
import { useT } from '../../i18n/useT'
import { formatBytes } from '../../lib/format'

const DASH = '—'

// Render an optional string/number as-is, or an em dash when absent — the
// contract is explicit that every optional field is guarded with a — fallback.
function orDash(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
}

// The engine serializes booleans as JSON strings ("true"/"false"); the schema
// coerces them, so by the time a bool reaches here it is a real boolean or
// undefined. Show a human word, em dash when unknown.
function boolWord(value: boolean | undefined): string {
  if (value === undefined) return DASH
  return value ? 'Yes' : 'No'
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

// sockets : cores : threads, the webadmin "CPU" shorthand. Any missing leg
// falls back to 1 so the triple still reads (the engine omits legs that equal
// their default); an entirely absent topology shows the em dash.
function formatCpuTopology(template: Template): string {
  const topology = template.cpu?.topology
  if (!topology) return DASH
  const { sockets, cores, threads } = topology
  if (sockets === undefined && cores === undefined && threads === undefined) return DASH
  return `${sockets ?? 1} : ${cores ?? 1} : ${threads ?? 1} (sockets : cores : threads)`
}

// creation_time is epoch ms (coerced from the engine's string form); render a
// locale timestamp, em dash when the template carries no creation time.
function formatCreationTime(ms: number | undefined): string {
  if (ms === undefined) return DASH
  return new Date(ms).toLocaleString()
}

export function TemplateGeneralTab({ template }: { template: Template }) {
  const t = useT()
  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('templateGeneral.card.general')}>
          <TextGroup term="Name" value={template.name} />
          <TextGroup term="Description" value={template.description} />
          {/* No cluster detail route exists yet — render the followed cluster
              name as text, mirroring HostGeneralTab / VM GeneralTab. */}
          <TextGroup term="Cluster" value={template.cluster?.name} />
          <TextGroup term="Operating system" value={template.os?.type} />
          <TextGroup term="Origin" value={template.origin} />
          <TextGroup term="Creation time" value={formatCreationTime(template.creation_time)} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('templateGeneral.card.system')}>
          <TextGroup term="Memory" value={formatBytes(template.memory)} />
          <TextGroup term="CPU" value={formatCpuTopology(template)} />
          <TextGroup term="BIOS type" value={template.bios?.type} />
          <TextGroup term="Display type" value={template.display?.type} />
          <DescriptionListGroup>
            <DescriptionListTerm>Stateless</DescriptionListTerm>
            <DescriptionListDescription>{boolWord(template.stateless)}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>High availability</DescriptionListTerm>
            <DescriptionListDescription>
              {boolWord(template.high_availability?.enabled)}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
