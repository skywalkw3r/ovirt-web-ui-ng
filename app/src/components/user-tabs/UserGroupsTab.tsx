import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useQuery } from '@tanstack/react-query'
import { listUserGroups } from '../../api/resources/users'
import { useCapabilities } from '../../auth/capabilities'
import { useAdminResourcePollInterval } from '../../hooks/useAdminResources'
import { useT } from '../../i18n/useT'
import { DomainLabel, GroupIdentityCell } from './PrincipalIdentity'

// The user's directory group memberships (GET /users/{id}/groups —
// DomainUserGroupsService). Read-only: membership lives in the directory, not
// the engine DB, so there is nothing to add/remove here. Four-state table with
// the same name/namespace/domain columns as the Groups page.
//
// Inlined useQuery (no hooks/ file for this one) keyed under the user detail
// namespace; Users is an admin/parity collection, so the poll honors the admin
// floor and the query stays disabled until the profile confirms admin.
export function UserGroupsTab({ userId }: { userId: string }) {
  const t = useT()
  const { isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()

  const groups = useQuery({
    queryKey: ['user', userId, 'groups'],
    queryFn: () => listUserGroups(userId),
    refetchInterval,
    enabled: isAdmin,
  })

  if (groups.isPending) {
    return (
      <>
        <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
        <Skeleton height="2.5rem" screenreaderText={t('groups.loading')} />
      </>
    )
  }

  if (groups.isError) {
    return (
      <EmptyState titleText={t('groups.error.title')} status="danger">
        <EmptyStateBody>
          {groups.error instanceof Error ? groups.error.message : t('common.error.unknown')}
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => void groups.refetch()}>
              {t('common.action.retry')}
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  if (groups.data.length === 0) {
    return (
      <EmptyState titleText={t('groups.empty.title')}>
        <EmptyStateBody>{t('groups.empty.body')}</EmptyStateBody>
      </EmptyState>
    )
  }

  return (
    <Table aria-label={t('groups.table.ariaLabel')} variant="compact">
      <Thead>
        <Tr>
          <Th>{t('common.field.name')}</Th>
          <Th>{t('groups.column.namespace')}</Th>
          <Th>{t('groups.column.domain')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {groups.data.map((group) => (
          <Tr key={group.id}>
            <Td dataLabel={t('common.field.name')}>
              <GroupIdentityCell group={group} />
            </Td>
            <Td dataLabel={t('groups.column.namespace')}>{group.namespace ?? '—'}</Td>
            <Td dataLabel={t('groups.column.domain')}>
              <DomainLabel domain={group.domain} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
