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
import type { Quota } from '../../api/schemas/quota'
import { useT } from '../../i18n/useT'

const DASH = '—'

// Render an optional string/number as-is, or an em dash when absent — mirrors
// the sibling General tabs (ClusterGeneralTab), which the contract points at as
// the SectionCard idiom.
function orDash(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return DASH
  return String(value)
}

// A percentage with a trailing %, em dash when the engine omitted it (an older
// quota may not carry all four). The schema coerces the engine's JSON-string
// form to a number before it reaches here.
function percent(value: number | undefined): string {
  if (value === undefined) return DASH
  return `${value}%`
}

function TextGroup({ term, value }: { term: string; value: string | number | undefined | null }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{orDash(value)}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// One bordered overview card: an h2 section heading over a compact two-column
// description list — the page keeps its single h1.
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

// General tab: identity (description, owning data center) plus the four
// grace/threshold percentages. Per QuotaMapper the REST names are a trap —
// `*_soft_limit_pct` is the engine THRESHOLD (warn at this consumption %) and
// `*_hard_limit_pct` is the engine GRACE (overage % allowed above 100% before
// enforcement blocks). The labels here follow the QuotaFormModal's copy so the
// two surfaces read identically. Name and data-center-id are already shown in
// the detail-page header above this tab; the data-center NAME is resolved by the
// page and handed down (a bare link on the quota carries only the id).
export function QuotaGeneralTab({
  quota,
  dataCenterName,
}: {
  quota: Quota
  dataCenterName?: string
}) {
  const t = useT()
  return (
    <Grid hasGutter>
      <GridItem lg={6}>
        <SectionCard title={t('quotaDetail.tab.general')}>
          <TextGroup term={t('common.field.description')} value={quota.description} />
          <TextGroup term={t('quotas.column.dataCenter')} value={dataCenterName} />
        </SectionCard>
      </GridItem>

      <GridItem lg={6}>
        <SectionCard title={t('quotaGeneral.card.enforcement')}>
          <TextGroup
            term={t('quotaGeneral.term.clusterWarning')}
            value={percent(quota.cluster_soft_limit_pct)}
          />
          <TextGroup
            term={t('quotaGeneral.term.clusterGrace')}
            value={percent(quota.cluster_hard_limit_pct)}
          />
          <TextGroup
            term={t('quotaGeneral.term.storageWarning')}
            value={percent(quota.storage_soft_limit_pct)}
          />
          <TextGroup
            term={t('quotaGeneral.term.storageGrace')}
            value={percent(quota.storage_hard_limit_pct)}
          />
        </SectionCard>
      </GridItem>
    </Grid>
  )
}
