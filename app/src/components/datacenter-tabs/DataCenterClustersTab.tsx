import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Cluster } from '../../api/schemas/cluster'
import { useDataCenterClusters } from '../../hooks/useDataCenterDetail'

// e.g. { major: 4, minor: 7 } → '4.7'; a bare major still renders. The live
// engine serializes the version scalars as JSON strings, so the Cluster schema
// coerces them to numbers before they reach this cell.
function CompatVersionCell({ version }: { version: Cluster['version'] }) {
  if (version?.major === undefined) return <>—</>
  return (
    <>{version.minor === undefined ? `${version.major}` : `${version.major}.${version.minor}`}</>
  )
}

export function DataCenterClustersTab({ dataCenterId }: { dataCenterId: string }) {
  const clusters = useDataCenterClusters(dataCenterId)

  return (
    <>
      {clusters.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText="Loading clusters" />
        </>
      )}

      {clusters.isError && (
        <EmptyState titleText="Could not load clusters" status="danger">
          <EmptyStateBody>
            {clusters.error instanceof Error ? clusters.error.message : 'Unknown error'}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void clusters.refetch()}>
            Retry
          </Button>
        </EmptyState>
      )}

      {clusters.isSuccess && clusters.data.length === 0 && (
        <EmptyState titleText="No clusters">
          <EmptyStateBody>No clusters are defined in this data center.</EmptyStateBody>
        </EmptyState>
      )}

      {clusters.isSuccess && clusters.data.length > 0 && (
        <Table aria-label="Clusters in this data center" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>CPU type</Th>
              <Th>Compatibility version</Th>
            </Tr>
          </Thead>
          <Tbody>
            {clusters.data.map((cluster) => (
              <Tr key={cluster.id}>
                <Td dataLabel="Name">
                  <Link to="/clusters/$clusterId" params={{ clusterId: cluster.id }}>
                    {cluster.name}
                  </Link>
                </Td>
                <Td dataLabel="CPU type">{cluster.cpu?.type ?? '—'}</Td>
                <Td dataLabel="Compatibility version">
                  <CompatVersionCell version={cluster.version} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
