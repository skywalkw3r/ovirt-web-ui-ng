import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useDataCenterQuotas } from '../../hooks/useDataCenterDetail'

// Quotas cap the resources a data center can hand out. They come from the
// 404-tolerant /quotas subcollection — engines without quota enforcement 404
// and the resource maps that to an empty list, which renders the empty state.
export function DataCenterQuotasTab({ dataCenterId }: { dataCenterId: string }) {
  const quotas = useDataCenterQuotas(dataCenterId)

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
              <Th>Name</Th>
              <Th>Description</Th>
            </Tr>
          </Thead>
          <Tbody>
            {quotas.data.map((quota, index) => (
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
