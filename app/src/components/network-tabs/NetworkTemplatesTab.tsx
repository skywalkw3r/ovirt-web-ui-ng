import { Button, EmptyState, EmptyStateBody, Skeleton } from '@patternfly/react-core'
import { Link } from '@tanstack/react-router'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useNetworkTemplates } from './useNetworkMembership'
import { sortRows, useColumnSort } from '../../hooks/useColumnSort'
import { useT } from '../../i18n/useT'

// Every column in visual order so each Th's index matches its position.
const NETWORK_TEMPLATE_KEYS = ['name', 'description'] as const

// Templates with a vNIC on this network. No server-side read exists
// (NetworkService has no templates locator), so useNetworkTemplates derives
// membership from the network's vNIC profiles + a single
// GET /templates?follow=nics join — see resources/networks.ts.
export function NetworkTemplatesTab({ networkId }: { networkId: string }) {
  const t = useT()
  const templates = useNetworkTemplates(networkId)
  // client-side header sort; no default — the engine list order stands until a
  // header is clicked (see hooks/useColumnSort)
  const { sort, thSort } = useColumnSort()

  // a blank description sorts as absent, so those rows sink instead of leading
  // with em dashes
  const sortedTemplates = sortRows(templates.data ?? [], sort, (template, key) =>
    key === 'name' ? template.name : template.description || undefined,
  )

  return (
    <>
      {templates.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('viewState.loading')} />
        </>
      )}

      {templates.isError && (
        <EmptyState titleText={t('viewState.error')} status="danger">
          <EmptyStateBody>
            {templates.error instanceof Error ? templates.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void templates.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {templates.isSuccess && templates.data.length === 0 && (
        <EmptyState titleText={t('viewState.empty')} />
      )}

      {templates.isSuccess && templates.data.length > 0 && (
        <Table aria-label={t('networkDetail.tab.templates')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(NETWORK_TEMPLATE_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(NETWORK_TEMPLATE_KEYS, 1)}>{t('common.field.description')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sortedTemplates.map((template) => (
              <Tr key={template.id}>
                <Td dataLabel={t('common.field.name')}>
                  <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                    {template.name}
                  </Link>
                </Td>
                <Td dataLabel={t('common.field.description')}>{template.description || '—'}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </>
  )
}
