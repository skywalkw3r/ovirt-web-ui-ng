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
import { diskSizeBytes, type Disk } from '../../api/schemas/disk'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'

const DASH = '—'

// Render an optional string/number as-is, or an em dash when absent — the
// contract is explicit that every optional field is guarded with a — fallback.
function orDash(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
}

// The engine serializes booleans as JSON strings ("true"/"false"); the schema
// coerces them, so by the time a bool reaches here it is a real boolean or
// undefined. Show a human word, em dash when unknown. Mirrors
// TemplateGeneralTab's boolWord.
function boolWord(value: boolean | undefined, t: ReturnType<typeof useT>): string {
  if (value === undefined) return DASH
  return value ? t('common.yes') : t('common.no')
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

export function DiskGeneralTab({ disk }: { disk: Disk }) {
  const t = useT()
  // Direct-LUN facts: the SAN kind and the bound LUN — rendered only when the
  // disk actually is a LUN disk (storage_type 'lun' / lun_storage present).
  const lun = disk.lun_storage?.logical_units?.logical_unit?.[0]
  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('diskGeneral.heading')}>
          {/* The disk's display name lives on `alias`; fall back to `name` so a
              disk without an explicit alias still reads. */}
          <TextGroup term={t('diskGeneral.term.alias')} value={disk.alias ?? disk.name} />
          <TextGroup term={t('common.field.id')} value={disk.id} />
          <TextGroup term={t('common.field.description')} value={disk.description} />
          {/* statusText self-guards undefined with the em dash. */}
          <TextGroup term={t('common.field.status')} value={statusText(disk.status)} />
          <TextGroup term={t('diskGeneral.term.contentType')} value={disk.content_type} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('diskGeneral.card.storage')}>
          {/* formatBytes self-guards undefined with the em dash; a direct-LUN
              disk reports its size from the bound LUN (diskSizeBytes). */}
          <TextGroup
            term={t('diskGeneral.term.provisionedSize')}
            value={formatBytes(diskSizeBytes(disk))}
          />
          <TextGroup
            term={t('diskGeneral.term.actualSize')}
            value={formatBytes(disk.actual_size)}
          />
          <TextGroup term={t('diskGeneral.term.format')} value={disk.format} />
          <TextGroup term={t('diskGeneral.term.storageType')} value={disk.storage_type} />
          {/* Direct-LUN backing facts — absent on image disks. */}
          {lun !== undefined && (
            <>
              <TextGroup
                term={t('disk.lun.term.sanType')}
                value={statusText(disk.lun_storage?.type)}
              />
              <TextGroup term={t('disk.lun.term.lunId')} value={lun.id} />
              {lun.target !== undefined && (
                <TextGroup term={t('disk.lun.term.target')} value={lun.target} />
              )}
            </>
          )}
          <DescriptionListGroup>
            <DescriptionListTerm>{t('diskGeneral.term.shareable')}</DescriptionListTerm>
            <DescriptionListDescription>{boolWord(disk.shareable, t)}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('diskGeneral.term.bootable')}</DescriptionListTerm>
            <DescriptionListDescription>{boolWord(disk.bootable, t)}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('diskGeneral.term.wipeAfterDelete')}</DescriptionListTerm>
            <DescriptionListDescription>
              {boolWord(disk.wipe_after_delete, t)}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
