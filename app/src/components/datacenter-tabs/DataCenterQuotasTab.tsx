import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useDataCenterQuotas } from '../../hooks/useDataCenterDetail'
import { useT } from '../../i18n/useT'

// Every column in visual order so each Th's index matches its position.
const DC_QUOTA_KEYS = ['name', 'description'] as const

// Quotas cap the resources a data center can hand out. They come from the
// 404-tolerant /quotas subcollection — engines without quota enforcement 404
// and the resource maps that to an empty list, which renders the empty state.
export function DataCenterQuotasTab({ dataCenterId }: { dataCenterId: string }) {
  const t = useT()
  const quotas = useDataCenterQuotas(dataCenterId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  const sortedQuotas = sortRows(quotas.data ?? [], sort, (quota, key) =>
    key === 'name' ? quota.name : quota.description || undefined,
  )

  return (
    <>
      {quotas.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('quotas.loading')} />
        </>
      )}

      {quotas.isError && (
        <EmptyState titleText={t('quotas.error.title')} status="danger">
          <EmptyStateBody>
            {quotas.error instanceof Error ? quotas.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void quotas.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {quotas.isSuccess && quotas.data.length === 0 && (
        <EmptyState titleText={t('quotas.empty.title')}>
          <EmptyStateBody>{t('dcQuotas.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {quotas.isSuccess && quotas.data.length > 0 && (
        <Table aria-label={t('quotas.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(DC_QUOTA_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(DC_QUOTA_KEYS, 1)}>{t('common.field.description')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedQuotas.map((quota, index) => (
              <Tr key={quota.id ?? index}>
                <Td dataLabel={t('common.field.name')}>{quota.name}</Td>
                <Td dataLabel={t('common.field.description')}>{quota.description ?? '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
