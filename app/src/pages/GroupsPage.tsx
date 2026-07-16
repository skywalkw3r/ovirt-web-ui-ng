import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listGroups, removeGroup } from '../api/resources/users'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { DomainLabel, GroupIdentityCell } from '../components/user-tabs/PrincipalIdentity'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useAdminResourcePollInterval } from '../hooks/useAdminResources'
import { useNotify } from '../notifications/context'
import { useT } from '../i18n/useT'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'

// The directory groups materialized into the engine DB (GET /groups —
// GroupsService). Rendered as the Groups tab of UsersGroupsPage, which owns
// the page shell, the admin gate, and the shared RefreshControl. Remove
// unmaterializes a group (DELETE /groups/{id} — GroupService.remove) behind a
// danger confirm; the group is added from the directory elsewhere, so there
// is no create here. UiCommon reference alongside UserListModel (the Users
// governance pair).
const GROUP_KEYS = ['name', 'namespace', 'domain'] as const

export function GroupsPanel() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const refetchInterval = useAdminResourcePollInterval()
  const queryClient = useQueryClient()
  const { notify } = useNotify()

  // Shares the ['groups', ''] cache entry the Add-Permission group picker reads
  // (usePermissionMutations.useGroups) — this observer just adds the poll and
  // the admin gate, mirroring useClustersInventory over useCatalog's clusters.
  const groups = useQuery({
    queryKey: ['groups', ''],
    queryFn: () => listGroups(),
    refetchInterval,
    enabled: isAdmin,
  })

  const [removing, setRemoving] = useState<{ groupId: string; name: string } | null>(null)
  // client-side name/namespace/domain filter — the group list is small
  const [filter, setFilter] = useState('')
  const { sort, thSort } = useColumnSort()
  const needle = filter.trim().toLowerCase()
  const filteredGroups = (groups.data ?? []).filter(
    (group) =>
      needle === '' ||
      (group.name ?? '').toLowerCase().includes(needle) ||
      (group.namespace ?? '').toLowerCase().includes(needle) ||
      (group.domain?.name ?? '').toLowerCase().includes(needle),
  )
  const sortedGroups = sortRows(filteredGroups, sort, (group, key) =>
    key === 'name'
      ? (group.name ?? group.id)
      : key === 'namespace'
        ? (group.namespace ?? undefined)
        : group.domain?.name,
  )

  // DELETE /groups/{id}. Engine faults (e.g. the group still grants access)
  // surface via error.message verbatim; the prefix invalidation refreshes both
  // this table and the Add-Permission group picker. Inlined (no hooks/ file)
  // but mirrors useRemoveUser's shape.
  const remove = useMutation({
    mutationFn: (vars: { groupId: string; name: string }) => removeGroup(vars.groupId),
    onSuccess: (_data, { name }) => {
      notify({ title: `Group ${name} removed`, variant: 'success' })
    },
    onError: (error) => {
      notify({ title: error.message, variant: 'danger' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })

  // Hidden below admin tier — the page already returns NotPermitted for
  // non-admins, so this only matters during the brief pre-profile window.
  const canManage = loaded && isAdmin

  return (
    <>
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarItem style={{ width: '18rem' }}>
            <SearchInput
              value={filter}
              onChange={setFilter}
              onCommit={() => {}}
              hint={t('groups.filter.hint')}
              ariaLabel={t('groups.filter.ariaLabel')}
            />
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {groups.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('groups.loading')} />
        </>
      )}

      {groups.isError && (
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
      )}

      {groups.isSuccess && groups.data.length === 0 && (
        <EmptyState titleText={t('groups.empty.title')}>
          <EmptyStateBody>{t('groups.empty.body')}</EmptyStateBody>
        </EmptyState>
      )}

      {groups.isSuccess && groups.data.length > 0 && sortedGroups.length === 0 && (
        <EmptyState titleText={t('common.state.searchEmpty.title')}>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="link" isInline onClick={() => setFilter('')}>
                {t('common.action.clearFilter')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {groups.isSuccess && sortedGroups.length > 0 && (
        <Table aria-label={t('groups.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(GROUP_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(GROUP_KEYS, 1)}>{t('groups.column.namespace')}</Th>
              <Th sort={thSort(GROUP_KEYS, 2)}>{t('groups.column.domain')}</Th>
              {canManage && <Th screenReaderText={t('common.field.actions')} />}
            </Tr>
          </Thead>
          <Tbody>
            {sortedGroups.map((group) => {
              const name = group.name ?? group.id
              return (
                <Tr key={group.id}>
                  <Td dataLabel={t('common.field.name')}>
                    <GroupIdentityCell group={group} />
                  </Td>
                  <Td dataLabel={t('groups.column.namespace')}>{group.namespace ?? '—'}</Td>
                  <Td dataLabel={t('groups.column.domain')}>
                    <DomainLabel domain={group.domain} />
                  </Td>
                  {canManage && (
                    <Td dataLabel={t('common.field.actions')} isActionCell>
                      <ActionsColumn
                        isDisabled={remove.isPending}
                        items={[
                          {
                            title: t('common.action.remove'),
                            isDanger: true,
                            onClick: () => setRemoving({ groupId: group.id, name }),
                          },
                        ]}
                      />
                    </Td>
                  )}
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {removing && (
        <ConfirmModal
          isOpen
          title={t('groups.remove.confirm.title', { name: removing.name })}
          body={t('groups.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          onConfirm={() => {
            const vars = removing
            setRemoving(null)
            remove.mutate(vars)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
