import { Button, EmptyState, EmptyStateBody, Label, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listTemplates } from '../../api/resources/templates'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { CATALOG_STALE_MS } from '../../hooks/useCatalog'
import { formatBytes, statusText } from '../../lib/format'

// The templates consuming this quota. Webadmin's QuotaTemplateListModel has no
// REST subcollection — Template extends VmBase in the api-model so every
// /templates row carries the quota as a bare { id } link, and this
// client-filters the catalog (the QuotaVmsTab pattern). Storage actually
// consumed would need a per-template disk walk, so the cheap defined-memory
// column stands in; 4 columns keeps the table under the ColumnPicker
// threshold. Catalog data — staleTime over polling, matching useTemplates.
export function QuotaTemplatesTab({ quotaId }: { quotaId: string }) {
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
        <Skeleton height="2.5rem" screenreaderText="Loading templates" />
      </>
    )
  }

  if (templates.isError) {
    return (
      <EmptyState titleText="Could not load templates" status="danger">
        <EmptyStateBody>
          {templates.error instanceof Error ? templates.error.message : 'Unknown error'}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void templates.refetch()}>
          Retry
        </Button>
      </EmptyState>
    )
  }

  if (templates.data.length === 0) {
    // no CTA: a template adopts a quota when it is created, not from the
    // quota's side
    return (
      <EmptyState titleText="No templates">
        <EmptyStateBody>No template consumes this quota.</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label="Templates consuming this quota" variant="compact">
      <Thead>
        <Tr>
          <Th width={30}>Name</Th>
          <Th width={15}>Status</Th>
          <Th>Cluster</Th>
          <Th>Defined memory</Th>
        </Tr>
      </Thead>
      <Tbody>
        {templates.data.map((template) => (
          <Tr key={template.id}>
            <Td dataLabel="Name">
              <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                {template.name}
              </Link>
            </Td>
            <Td dataLabel="Status">
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
            <Td dataLabel="Cluster">
              {template.cluster?.name ?? clusterNames.get(template.cluster?.id ?? '') ?? '—'}
            </Td>
            <Td dataLabel="Defined memory">{formatBytes(template.memory)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
