import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import {
  importedProviderNetworkNames,
  listProviderNetworks,
  type OpenStackNetwork,
} from '../../api/resources/providers'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'
import { useNetworks } from '../../hooks/useNetworks'
import { useT } from '../../i18n/useT'
import { StatusBadge } from '../StatusBadge'
import { ProviderNetworkImportModal } from './ProviderNetworkImportModal'

// The provider-detail Networks subtab (network-kind providers only). It lists
// the external/OVN networks the provider itself holds — the same source list
// webadmin's "Import Networks" dialog offers (GET
// /openstacknetworkproviders/{id}/networks) — and offers a per-row Import into a
// chosen data center, reusing the import machinery via ProviderNetworkImportModal.
//
// Already-imported rows are marked by joining the engine's networks against this
// provider (importedProviderNetworkNames): the REST Network read model exposes
// no provider-side network id, so the name-within-provider join is the only key
// available client-side (best-effort — if the networks query has not resolved,
// nothing is marked and every row stays importable).
export function ProviderNetworksTab({ providerId }: { providerId: string }) {
  const t = useT()
  const [importing, setImporting] = useState<OpenStackNetwork | null>(null)

  const refetchInterval = useAdminResourcePollInterval()
  const providerNetworks = useQuery({
    queryKey: ['provider', providerId, 'networks'],
    queryFn: () => listProviderNetworks(providerId),
    refetchInterval,
  })
  const rows = providerNetworks.data ?? []

  // The engine's networks, used only to mark which provider networks are
  // already imported. A failure/loading here does not block the tab — it just
  // leaves rows unmarked (and therefore importable).
  const networks = useNetworks()
  const importedNames = importedProviderNetworkNames(networks.data ?? [], providerId)

  return (
    <>
      {providerNetworks.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('network.import.networks.loading')} />
        </>
      )}

      {providerNetworks.isError && (
        <EmptyState titleText={t('network.import.networks.error.title')} status="danger">
          <EmptyStateBody>
            {providerNetworks.error instanceof Error
              ? providerNetworks.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void providerNetworks.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {providerNetworks.isSuccess && rows.length === 0 && (
        <EmptyState titleText={t('network.import.networks.empty.title')}>
          <EmptyStateBody>{t('network.import.networks.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {providerNetworks.isSuccess && rows.length > 0 && (
        <Table aria-label={t('network.import.networks.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('common.field.description')}</Th>
              <Th>{t('network.import.column.externalId')}</Th>
              <Th>{t('common.field.status')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => {
              const imported = row.name !== undefined && importedNames.has(row.name)
              return (
                <Tr key={row.id}>
                  <Td dataLabel={t('common.field.name')}>{row.name ?? '—'}</Td>
                  <Td dataLabel={t('common.field.description')}>{row.description || '—'}</Td>
                  <Td dataLabel={t('network.import.column.externalId')}>
                    <code>{row.id}</code>
                  </Td>
                  <Td dataLabel={t('common.field.status')}>
                    {imported ? (
                      <StatusBadge color="green">
                        {t('providerDetail.networks.imported')}
                      </StatusBadge>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    {!imported && (
                      <Button
                        variant="secondary"
                        onClick={() => setImporting(row)}
                        aria-label={t('network.import.select', { name: row.name ?? row.id })}
                      >
                        {t('providerDetail.networks.import')}
                      </Button>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {importing && (
        <ProviderNetworkImportModal
          isOpen
          providerId={providerId}
          network={importing}
          onClose={() => setImporting(null)}
        />
      )}
    </>
  )
}
