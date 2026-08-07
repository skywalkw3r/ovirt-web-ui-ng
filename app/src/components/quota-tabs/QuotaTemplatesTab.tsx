import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listTemplates } from '../../api/resources/templates'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { CATALOG_STALE_MS } from '../../hooks/useCatalog'
import { useT } from '../../i18n/useT'
import { formatBytes, statusText } from '../../lib/format'

// The templates consuming this quota. Webadmin's QuotaTemplateListModel has no
// REST subcollection — Template extends VmBase in the api-model so every
// /templates row carries the quota as a bare { id } link, and this
// client-filters the catalog (the QuotaVmsTab pattern). Storage actually
// consumed would need a per-template disk walk, so the cheap defined-memory
// column stands in; 4 columns keeps the table under the ColumnPicker
// threshold. Catalog data — staleTime over polling, matching useTemplates.
export function QuotaTemplatesTab({ quotaId }: { quotaId: string }) {
  const t = useT()
  const templates = useQuery({
    queryKey: ['quota', quotaId, 'templates'],
    queryFn: () => listTemplates(),
    select: (data) => data.filter((template) => template.quota?.id === quotaId),
    staleTime: CATALOG_STALE_MS,
  })

  // Cluster-name join against the cached clusters inventory — the live
  // /templates feed serializes cluster as a bare { id } link.
  const clusters = useClustersInventory()
  const clusterNames = new Map((clusters.data ?? []).map((cluster) => [cluster.id, cluster.name]))

  if (templates.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('templates.loading')} />
      </>
    )
  }

  if (templates.isError) {
    return (
      <EmptyState titleText={t('templates.error.title')} status="danger">
        <EmptyStateBody>
          {templates.error instanceof Error ? templates.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void templates.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (templates.data.length === 0) {
    // no CTA: a template adopts a quota when it is created, not from the
    // quota's side
    return (
      <EmptyState titleText={t('templates.empty.title')}>
        <EmptyStateBody>{t('quotaTemplates.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label={t('quotaTemplates.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th width={30}>{t('common.field.name')}</Th>
          <Th width={15}>{t('common.field.status')}</Th>
          <Th>{t('common.field.cluster')}</Th>
          <Th>{t('quotaVms.column.definedMemory')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {templates.data.map((template) => (
          <Tr key={template.id}>
            <Td dataLabel={t('common.field.name')}>
              <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                {template.name}
              </Link>
            </Td>
            <Td dataLabel={t('common.field.status')}>
              {template.status === undefined ? (
                '—'
              ) : (
                // ok green / locked blue / illegal red — the TemplatesPage
                // status idiom
                <Label
                  isCompact
                  color={
                    template.status === 'ok'
                      ? 'green'
                      : template.status === 'locked'
                        ? 'blue'
                        : 'red'
                  }
                >
                  {statusText(template.status)}
                </Label>
              )}
            </Td>
            <Td dataLabel={t('common.field.cluster')}>
              {template.cluster?.name ?? clusterNames.get(template.cluster?.id ?? '') ?? '—'}
            </Td>
            <Td dataLabel={t('quotaVms.column.definedMemory')}>{formatBytes(template.memory)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
