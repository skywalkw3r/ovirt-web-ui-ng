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
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { QuotaClusterLimit } from '../../api/schemas/quota'
import { useClustersInventory } from '../../hooks/useAdminResources'
import { useDeleteQuotaClusterLimit, useQuotaClusterLimits } from '../../hooks/useQuotaMutations'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { QuotaClusterLimitModal } from './QuotaClusterLimitModal'
import { formatCountLimit, formatGibLimit, isAllTargets } from './quota-limits'

// Per-cluster memory (GiB) + vCPU caps. Backs GET /quotas/{id}/quotaclusterlimits
// (useQuotaClusterLimits); a limit with a null cluster link is the "All clusters"
// sentinel that caps the whole data center. -1 on an axis is "Unlimited". CRUD is
// admin-only server-side; the detail route is already gated behind loaded &&
// isAdmin in QuotaDetailPage, so this tab does not re-gate. Remove confirms via
// the shared danger ConfirmModal.
export function QuotaClusterLimitsTab({
  quotaId,
  dataCenterId,
}: {
  quotaId: string
  dataCenterId?: string
}) {
  const t = useT()
  const limits = useQuotaClusterLimits(quotaId)
  const clusters = useClustersInventory()
  const remove = useDeleteQuotaClusterLimit()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<QuotaClusterLimit | null>(null)
  const [removing, setRemoving] = useState<QuotaClusterLimit | null>(null)

  // Clusters in the quota's data center back the add/edit target select and
  // resolve the grid's target-name column. A quota's limits only ever reference
  // clusters in its own DC, so scoping the options keeps the picker honest.
  const clusterOptions = (clusters.data ?? [])
    .filter((cluster) => dataCenterId === undefined || cluster.data_center?.id === dataCenterId)
    .map((cluster) => ({ id: cluster.id, name: cluster.name }))
  const clusterNames = new Map(clusterOptions.map((option) => [option.id, option.name]))

  // Targets already carrying a limit (the sentinel rides as ''), so the Add
  // modal can hide them — each cluster gets at most one limit row.
  const usedClusterIds = new Set((limits.data ?? []).map((limit) => limit.cluster?.id ?? ''))

  const targetName = (limit: QuotaClusterLimit) => {
    const id = limit.cluster?.id
    if (isAllTargets(id)) return t('quota.limits.allClusters')
    return limit.cluster?.name ?? clusterNames.get(id as string) ?? id
  }

  return (
    <>
      {limits.isSuccess && limits.data.length > 0 && (
        <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  {t('common.action.add')}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      )}

      {limits.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('quotaDetail.loading')} />
        </>
      )}

      {limits.isError && (
        <EmptyState titleText={t('quotaDetail.error.title')} status="danger">
          <EmptyStateBody>
            {limits.error instanceof Error ? limits.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <Button variant="primary" onClick={() => void limits.refetch()}>
            {t('common.action.retry')}
          </Button>
        </EmptyState>
      )}

      {limits.isSuccess && limits.data.length === 0 && (
        <EmptyState titleText={t('quota.limits.cluster')}>
          <EmptyStateBody>{t('quota.limits.cluster.emptyBody')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('common.action.add')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {limits.isSuccess && limits.data.length > 0 && (
        <Table aria-label={t('quota.limits.cluster')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('quota.limits.column.cluster')}</Th>
              <Th>{t('quota.limits.memory')}</Th>
              <Th>{t('quota.limits.vcpus')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {limits.data.map((limit, index) => (
              <Tr key={limit.id ?? index}>
                <Td dataLabel={t('quota.limits.column.cluster')}>{targetName(limit)}</Td>
                <Td dataLabel={t('quota.limits.memory')}>
                  {formatGibLimit(limit.memory_limit, t('quota.limits.unlimited'))}
                </Td>
                <Td dataLabel={t('quota.limits.vcpus')}>
                  {formatCountLimit(limit.vcpu_limit, t('quota.limits.unlimited'))}
                </Td>
                <Td dataLabel={t('common.field.actions')} isActionCell>
                  <ActionsColumn
                    isDisabled={remove.isPending}
                    items={[
                      { title: t('common.action.edit'), onClick: () => setEditing(limit) },
                      {
                        title: t('common.action.remove'),
                        isDanger: true,
                        onClick: () => setRemoving(limit),
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
        <QuotaClusterLimitModal
          quotaId={quotaId}
          clusterOptions={clusterOptions}
          usedClusterIds={usedClusterIds}
          isOpen
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <QuotaClusterLimitModal
          quotaId={quotaId}
          clusterOptions={clusterOptions}
          usedClusterIds={usedClusterIds}
          limit={editing}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('quota.limits.cluster.remove.title', { name: targetName(removing) ?? '' })}
          body={t('quota.limits.cluster.remove.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending || removing.id === undefined}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            if (target.id) remove.mutate({ quotaId, limitId: target.id })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
