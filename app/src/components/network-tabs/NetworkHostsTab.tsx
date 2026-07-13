import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { StatusBadge } from '../StatusBadge'
import { useNetworkHosts } from './useNetworkMembership'
import { useT } from '../../i18n/useT'

// The hosts that carry this network as an attachment. There is no server-side
// read (NetworkService has no hosts locator), so useNetworkHosts fans out over
// the global /hosts list and each host's /networkattachments — see the join
// rationale in resources/networks.ts. Green when the host's live config matches
// the DC definition, orange when it drifted (NetworkAttachment.in_sync).
function AttachmentBadge({ inSync }: { inSync: boolean }) {
  const t = useT()
  return inSync ? (
    <StatusBadge color="green">{t('networkDetail.hosts.attached')}</StatusBadge>
  ) : (
    <StatusBadge color="orange">{t('networkDetail.hosts.outOfSync')}</StatusBadge>
  )
}

export function NetworkHostsTab({ networkId }: { networkId: string }) {
  const t = useT()
  const hosts = useNetworkHosts(networkId)

  return (
    <>
      {hosts.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('viewState.loading')} />
        </>
      )}

      {hosts.isError && (
        <EmptyState titleText={t('viewState.error')} status="danger">
          <EmptyStateBody>
            {hosts.error instanceof Error ? hosts.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void hosts.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {hosts.isSuccess && hosts.data.length === 0 && (
        <EmptyState titleText={t('viewState.empty')} />
      )}

      {hosts.isSuccess && hosts.data.length > 0 && (
        <Table aria-label={t('networkDetail.tab.hosts')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('common.field.status')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {hosts.data.map(({ host, inSync }) => (
              <Tr key={host.id}>
                <Td dataLabel={t('common.field.name')}>
                  <Link to="/hosts/$hostId" params={{ hostId: host.id }}>
                    {host.name}
                  </Link>
                </Td>
                <Td dataLabel={t('common.field.status')}>
                  <AttachmentBadge inSync={inSync} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
