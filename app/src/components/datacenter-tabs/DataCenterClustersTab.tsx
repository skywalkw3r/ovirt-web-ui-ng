import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Cluster } from '../../api/schemas/cluster'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
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

// The version's sort weight — major/minor as one number so 4.10 lands after
// 4.7, which the rendered '4.7' string would collate the other way round.
function compatVersionValue(version: Cluster['version']): number | undefined {
  if (version?.major === undefined) return undefined
  return version.major * 1000 + (version.minor ?? 0)
}

// Every column in visual order so each Th's index matches its position.
const DC_CLUSTER_KEYS = ['name', 'cpuType', 'compatVersion'] as const

export function DataCenterClustersTab({ dataCenterId }: { dataCenterId: string }) {
  const clusters = useDataCenterClusters(dataCenterId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  const sortedClusters = sortRows(clusters.data ?? [], sort, (cluster, key) =>
    key === 'name'
      ? cluster.name
      : key === 'cpuType'
        ? cluster.cpu?.type
        : compatVersionValue(cluster.version),
  )

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
              <Th sort={thSort(DC_CLUSTER_KEYS, 0)}>Name</Th>
              <Th sort={thSort(DC_CLUSTER_KEYS, 1)}>CPU type</Th>
              <Th sort={thSort(DC_CLUSTER_KEYS, 2)}>Compatibility version</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedClusters.map((cluster) => (
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
