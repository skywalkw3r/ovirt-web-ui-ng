import { Button, EmptyState, EmptyStateBody, Label, Skeleton } from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listUserQuotas, type UserQuotaGrant } from '../../api/resources/users'
import { useCapabilities } from '../../auth/capabilities'
import { useDataCenters } from '../../hooks/useAdminResources'
import { useT } from '../../i18n/useT'

// The quotas this user can consume — webadmin's user Quota subtab
// (UserQuotaListModel). Read-only: consumers are assigned from the QUOTA side
// (its Permissions), so there is nothing to add/remove here. The read model is
// listUserQuotas' quota-side join (see its divergence comment in
// api/resources/users.ts — the user's own permission rows drop the quota
// object link over REST, so this cannot be a pure client-side join).
//
// Inlined useQuery per the user-tabs house pattern, keyed under the user
// detail namespace; admin/parity collection, so the query stays disabled until
// the profile confirms admin.
export function UserQuotaTab({ userId }: { userId: string }) {
  const t = useT()
  const { isAdmin } = useCapabilities()

  const grants = useQuery({
    queryKey: ['user', userId, 'quotas'],
    queryFn: () => listUserQuotas(userId),
    // No poll: listUserQuotas fans out one permissions read per quota (on top of
    // listQuotas' per-DC fan-out), and quota grants change rarely — polling this
    // at the 60s admin cadence while the tab is open would be ~1 req/quota/min
    // per viewer. RefreshControl still refetches on demand (it invalidates every
    // query); the 5-min staleTime avoids a refetch on each tab revisit.
    refetchInterval: false,
    staleTime: 5 * 60_000,
    enabled: isAdmin,
  })

  // Quota rows carry their data center as a bare id link — join the name
  // against the cached DC inventory, same as QuotasPage.
  const dataCenters = useDataCenters()
  const dataCenterNames = new Map(
    (dataCenters.data ?? []).map((dataCenter) => [dataCenter.id, dataCenter.name]),
  )

  if (grants.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('quotas.loading')} />
      </>
    )
  }

  if (grants.isError) {
    return (
      <EmptyState titleText={t('quotas.error.title')} status="danger">
        <EmptyStateBody>
          {grants.error instanceof Error ? grants.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <Button variant="primary" onClick={() => void grants.refetch()}>
          {t('common.action.retry')}
        </Button>
      </EmptyState>
    )
  }

  if (grants.data.length === 0) {
    return (
      <EmptyState titleText="No quota assignments">
        <EmptyStateBody>
          Quotas this user can consume appear here. Assign the user (or one of their groups) as a
          consumer from the quota&apos;s Permissions.
        </EmptyStateBody>
      </EmptyState>
    )
  }

  const grantedVia = (grant: UserQuotaGrant) => {
    switch (grant.via.kind) {
      case 'user':
        return 'Direct'
      case 'group':
        return <Label isCompact>{grant.via.name}</Label>
      case 'everyone':
        return <Label isCompact>Everyone</Label>
    }
  }

  return (
    <Table aria-label={t('quotas.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th>{t('common.field.name')}</Th>
          <Th>{t('common.field.description')}</Th>
          <Th>{t('quotas.column.dataCenter')}</Th>
          <Th>Granted via</Th>
        </Tr>
      </Thead>
      <Tbody>
        {grants.data.map((grant) => (
          <Tr key={grant.quota.id}>
            <Td dataLabel={t('common.field.name')}>
              <Link to="/quotas/$quotaId" params={{ quotaId: grant.quota.id }}>
                {grant.quota.name}
              </Link>
            </Td>
            <Td dataLabel={t('common.field.description')}>{grant.quota.description || '—'}</Td>
            <Td dataLabel={t('quotas.column.dataCenter')}>
              {(grant.quota.data_center?.id !== undefined
                ? dataCenterNames.get(grant.quota.data_center.id)
                : undefined) ?? '—'}
            </Td>
            <Td dataLabel="Granted via">{grantedVia(grant)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
