import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { HostStatusLabel } from '../HostStatusLabel'
import { HostedEngineCrown } from '../HostedEngineCrown'
import { useClusterHosts } from '../../hooks/useClusterDetail'
import { useT } from '../../i18n/useT'

// The hosts belonging to this cluster. Hosts have no engine-search entry point
// in this app, so useClusterHosts pulls the global /hosts feed and filters
// client-side on the cluster back-link (host.cluster.id). Keyed by cluster id so
// a rename never orphans the cache entry. Mirrors TemplateVmsTab's four-state
// shell.

export function ClusterHostsTab({ clusterId }: { clusterId: string }) {
  const hosts = useClusterHosts(clusterId)
  const t = useT()

  if (hosts.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('hosts.loading')} />
      </>
    )
  }

  if (hosts.isError) {
    return (
      <EmptyState titleText={t('clusterHosts.error.title')} status="danger">
        <EmptyStateBody>
          {hosts.error instanceof Error ? hosts.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void hosts.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (hosts.data.length === 0) {
    return (
      <EmptyState titleText={t('hosts.empty.title')}>
        <EmptyStateBody>{t('clusterHosts.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label={t('clusterHosts.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th width={30}>{t('common.field.name')}</Th>
          <Th width={15}>{t('common.field.status')}</Th>
          <Th>{t('common.field.description')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {hosts.data.map((host) => (
          <Tr key={host.id}>
            <Td dataLabel={t('common.field.name')}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--pf-t--global--spacer--sm)',
                }}
              >
                {/* crown leads the name so the HE markers align down the column */}
                <HostedEngineCrown hostedEngine={host.hosted_engine} hostId={host.id} />
                <Link to="/hosts/$hostId" params={{ hostId: host.id }}>
                  {host.name}
                </Link>
              </span>
            </Td>
            <Td dataLabel={t('common.field.status')}>
              <HostStatusLabel status={host.status} />
            </Td>
            {/* description with comment fallback — single line, full text on
                hover (matches the inventory truncation convention) */}
            <Td
              dataLabel={t('common.field.description')}
              modifier="truncate"
              title={host.description ?? host.comment ?? undefined}
            >
              {host.description ?? host.comment ?? '—'}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
