import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useDataCenterQuotas } from '../../hooks/useDataCenterDetail'

// Every column in visual order so each Th's index matches its position.
const DC_QUOTA_KEYS = ['name', 'description'] as const

// Quotas cap the resources a data center can hand out. They come from the
// 404-tolerant /quotas subcollection — engines without quota enforcement 404
// and the resource maps that to an empty list, which renders the empty state.
export function DataCenterQuotasTab({ dataCenterId }: { dataCenterId: string }) {
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
          <Skeleton height="2.5rem" screenreaderText="Loading quotas" />
        </>
      )}

      {quotas.isError && (
        <EmptyState titleText="Could not load quotas" status="danger">
          <EmptyStateBody>
            {quotas.error instanceof Error ? quotas.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void quotas.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {quotas.isSuccess && quotas.data.length === 0 && (
        <EmptyState titleText="No quotas">
          <EmptyStateBody>No quotas are defined on this data center.</EmptyStateBody>
        </EmptyState>
      )}

      {quotas.isSuccess && quotas.data.length > 0 && (
        <Table aria-label="Quotas" variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(DC_QUOTA_KEYS, 0)}>Name</Th>
              <Th sort={thSort(DC_QUOTA_KEYS, 1)}>Description</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedQuotas.map((quota, index) => (
              <Tr key={quota.id ?? index}>
                <Td dataLabel="Name">{quota.name}</Td>
                <Td dataLabel="Description">{quota.description ?? '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
