import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { ClusterAffinityGroup } from '../../api/resources/clusters'
import { useClusterAffinityGroups } from '../../hooks/useClusterDetail'
import { useDeleteAffinityGroup } from '../../hooks/useClusterMutations'
import { useT } from '../../i18n/useT'
import { AffinityGroupModal } from '../affinity/AffinityGroupModal'
import { ConfirmModal } from '../ConfirmModal'

// VM affinity groups keep VMs together (positive) or apart (negative) within
// the cluster. They ride the 404-tolerant /affinitygroups subcollection —
// clusters with none defined 404 and the resource maps that to an empty list,
// which renders the empty state. `positive`/`enforcing` arrive as JSON strings
// on the live engine, so the resource schema already coerces them to booleans;
// treat only an explicit true as positive/enforcing.
//
// CRUD (New/Edit/Remove) is admin-only server-side. The whole cluster detail
// route is already gated behind loaded && isAdmin in ClusterDetailPage (a user
// tier gets NotPermitted), matching the sibling cluster tabs — so this tab does
// not re-gate. Remove confirms via the shared danger ConfirmModal.
export function ClusterAffinityGroupsTab({
  clusterId,
  clusterName,
}: {
  clusterId: string
  clusterName: string
}) {
  const affinityGroups = useClusterAffinityGroups(clusterId)
  const remove = useDeleteAffinityGroup()
  const t = useT()

  // create when the flag is set; edit when a group is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ClusterAffinityGroup | null>(null)
  const [removing, setRemoving] = useState<ClusterAffinityGroup | null>(null)

  return (
    <>
      {affinityGroups.isSuccess && affinityGroups.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  {t('clusterAffinityGroups.new')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {affinityGroups.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('clusterAffinityGroups.loading')} />
        </>
      )}

      {affinityGroups.isError && (
        <EmptyState titleText={t('clusterAffinityGroups.error.title')} status="danger">
          <EmptyStateBody>
            {affinityGroups.error instanceof Error
              ? affinityGroups.error.message
              : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void affinityGroups.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {affinityGroups.isSuccess && affinityGroups.data.length === 0 && (
        <EmptyState titleText={t('clusterAffinityGroups.empty.title')}>
          <EmptyStateBody>{t('clusterAffinityGroups.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('clusterAffinityGroups.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {affinityGroups.isSuccess && affinityGroups.data.length > 0 && (
        <Table aria-label={t('clusterAffinityGroups.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('common.field.name')}</Th>
              <Th>{t('clusterAffinityGroups.column.polarity')}</Th>
              <Th>{t('clusterAffinityGroups.column.enforcing')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {affinityGroups.data.map((group) => (
              <Tr key={group.id}>
                <Td dataLabel={t('common.field.name')}>{group.name ?? '—'}</Td>
                <Td dataLabel={t('clusterAffinityGroups.column.polarity')}>
                  {group.positive === true ? (
                    <Label isCompact color="green">
                      {t('clusterAffinityGroups.polarity.positive')}
                    </Label>
                  ) : (
                    <Label isCompact color="orange">
                      {t('clusterAffinityGroups.polarity.negative')}
                    </Label>
                  )}
                </Td>
                <Td dataLabel={t('clusterAffinityGroups.column.enforcing')}>
                  {group.enforcing === true ? t('common.yes') : t('common.no')}
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(group) },
                      {
                        title: t('common.action.remove'),
                        isDanger: true,
                        onClick: () => setRemoving(group),
                      },
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {creating && (
        <AffinityGroupModal
          clusterId={clusterId}
          clusterName={clusterName}
          isOpen
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <AffinityGroupModal
          clusterId={clusterId}
          clusterName={clusterName}
          group={editing}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('clusterAffinityGroups.remove.confirm.title', {
            name: removing.name ?? removing.id,
          })}
          body={t('clusterAffinityGroups.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ clusterId, groupId: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
