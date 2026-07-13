import type { ReactNode } from 'react'
import {
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core'
import type { VmPool } from '../../api/schemas/pool'
import { useT } from '../../i18n/useT'
import { statusText } from '../../lib/format'

const DASH = '—'

// One bordered overview card: an h2 section heading over a compact two-column
// description list — mirrors TemplateGeneralTab's SectionCard so the detail
// pages read the same. The page keeps its single h1.
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card isCompact>
      <CardTitle component="h2">{title}</CardTitle>
      <CardBody>
        <DescriptionList isCompact columnModifier={{ default: '1Col', md: '2Col' }}>
          {children}
        </DescriptionList>
      </CardBody>
    </Card>
  )
}

function Fact({ term, value }: { term: string; value: ReactNode }) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>{value}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

// The pool's General facts. `clusterName` is resolved by the page against the
// clusters inventory (VmPoolMapper returns cluster as an id-only link on the
// live read), falling back to whatever the read carries. The Template fact is
// best-effort: the live read populates neither template nor vm (VmPoolMapper
// maps neither), so it degrades to the base VM id / em dash — the mock detail
// fixture inlines a template link so the fact renders in dev.
export function PoolGeneralTab({ pool, clusterName }: { pool: VmPool; clusterName?: string }) {
  const t = useT()

  const cluster = clusterName ?? pool.cluster?.name ?? pool.cluster?.id ?? DASH
  const template = pool.template?.name ?? pool.template?.id ?? pool.vm?.id ?? DASH
  const size = pool.size !== undefined ? String(pool.size) : DASH
  const prestarted = pool.prestarted_vms !== undefined ? String(pool.prestarted_vms) : DASH
  const maxUserVms = pool.max_user_vms !== undefined ? String(pool.max_user_vms) : DASH

  return (
    <SectionCard title={t('poolDetail.tab.general')}>
      <Fact term={t('poolDetail.field.type')} value={pool.type ? statusText(pool.type) : DASH} />
      <Fact term={t('poolDetail.field.size')} value={size} />
      <Fact term={t('poolDetail.field.prestarted')} value={prestarted} />
      <Fact term={t('poolDetail.field.maxUserVms')} value={maxUserVms} />
      <Fact
        term={t('poolDetail.field.stateful')}
        value={pool.stateful ? t('common.yes') : t('common.no')}
      />
      <Fact term={t('poolDetail.field.template')} value={template} />
      <Fact term={t('poolDetail.field.cluster')} value={cluster} />
    </SectionCard>
  )
}
