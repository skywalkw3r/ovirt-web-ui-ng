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
  Progress,
} from '@patternfly/react-core'
import type { StorageDomain } from '../../api/schemas/storage-domain'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'
import { storageUsedPercent } from '../../lib/storageDomain'
import { capacityVariant } from '../../lib/utilization'

const DASH = '—'
// Widest the capacity bar gets (≈ a list-page cell); narrower columns shrink it.
const CAPACITY_BAR_MAX_WIDTH = '24rem'

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

// NFS/gluster domains report address + path; block domains may report neither.
// Join them in the conventional address:path form when both are present.
function formatPath(storage: StorageDomain['storage']): string | undefined {
  if (storage === undefined) return undefined
  const { address, path } = storage
  if (address && path) return `${address}:${path}`
  return address || path || undefined
}

// getStorageDomain follows data_centers, so attached domains carry names here;
// unattached ones (e.g. a detached ISO domain) have no entries at all.
function formatDataCenters(dataCenters: StorageDomain['data_centers']): string | undefined {
  const names = (dataCenters?.data_center ?? [])
    .map((dc) => dc.name ?? dc.id)
    .filter((name): name is string => Boolean(name))
  return names.length > 0 ? names.join(', ') : undefined
}

// used / available / committed are all optional bytes; show whichever the
// engine reported, or fall through to the em dash when none are present.
// Text-only fallback for a domain that reports no capacity pair (the bar
// below needs both used and available).
function formatSize(storageDomain: StorageDomain, t: ReturnType<typeof useT>): string | undefined {
  const { used, available, committed } = storageDomain
  if (used === undefined && available === undefined && committed === undefined) return undefined
  const parts = [
    t('storageGeneral.size.used', { value: formatBytes(used) }),
    t('storageGeneral.size.available', { value: formatBytes(available) }),
    t('storageGeneral.size.committed', { value: formatBytes(committed) }),
  ]
  return parts.join(' / ')
}

// The Size term as a capacity bar: used of total with the percent as the
// bar's own label, the shared 60/80 warning/danger palette the list page and
// dashboard use, and the available/committed figures underneath — committed
// can exceed the capacity (thin provisioning), which is exactly the number an
// operator wants to spot, so it stays visible rather than folded into the bar.
// Sits in the description-list column flow like every other term, and the bar
// is capped so a wide monitor doesn't stretch it into a hairline — the fill
// proportion is the signal and it reads best at roughly the width of a cell.
function CapacityGroup({ storageDomain }: { storageDomain: StorageDomain }) {
  const t = useT()
  const { used, available, committed, name } = storageDomain
  if (used === undefined || available === undefined) {
    return <TextGroup term={t('storageGeneral.term.size')} value={formatSize(storageDomain, t)} />
  }
  const total = used + available
  const percent = storageUsedPercent(storageDomain) ?? 0
  const measure = t('storage.capacity.measure', {
    used: formatBytes(used),
    total: formatBytes(total),
    percent: Math.round(percent),
  })
  const detail = [
    t('storageGeneral.size.available', { value: formatBytes(available) }),
    ...(committed !== undefined
      ? [t('storageGeneral.size.committed', { value: formatBytes(committed) })]
      : []),
  ].join(' · ')
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{t('storageGeneral.term.size')}</DescriptionListTerm>
      <DescriptionListDescription>
        <div style={{ maxWidth: CAPACITY_BAR_MAX_WIDTH }}>
          <Progress
            value={percent}
            variant={capacityVariant(percent)}
            title={measure}
            valueText={measure}
            measureLocation="none"
            aria-label={t('storage.capacity.ariaLabel', { name: name ?? DASH })}
          />
          <div className="pf-v6-u-color-200 pf-v6-u-font-size-sm pf-v6-u-mt-xs">{detail}</div>
        </div>
      </DescriptionListDescription>
    </DescriptionListGroup>
  )
}

export function StorageDomainGeneralTab({ storageDomain }: { storageDomain: StorageDomain }) {
  const t = useT()
  // The schema coerces the engine's "true"/"false" strings to real booleans.
  const yesNo = (value: boolean | undefined): string | undefined => {
    if (value === undefined) return undefined
    return value ? t('common.yes') : t('common.no')
  }

  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('storageGeneral.heading')}>
          <TextGroup term={t('common.field.name')} value={storageDomain.name} />
          <TextGroup term={t('common.field.description')} value={storageDomain.description} />
          <TextGroup term={t('common.field.id')} value={storageDomain.id} />
          <TextGroup term={t('common.field.type')} value={storageDomain.type} />
          <TextGroup
            term={t('storageGeneral.term.dataCenter')}
            value={formatDataCenters(storageDomain.data_centers)}
          />
          {/* attached domains report status; unattached ones only external_status */}
          <TextGroup
            term={t('common.field.status')}
            value={statusText(storageDomain.status ?? storageDomain.external_status)}
          />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('storageGeneral.card.storage')}>
          <TextGroup
            term={t('storageGeneral.term.storageType')}
            value={storageDomain.storage?.type}
          />
          <TextGroup
            term={t('storageGeneral.term.path')}
            value={formatPath(storageDomain.storage)}
          />
          <TextGroup term={t('storageGeneral.term.format')} value={storageDomain.storage_format} />
          <CapacityGroup storageDomain={storageDomain} />
          <TextGroup
            term={t('storageGeneral.term.wipeAfterDelete')}
            value={yesNo(storageDomain.wipe_after_delete)}
          />
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
