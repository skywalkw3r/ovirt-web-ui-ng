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
import type { QuotaStorageLimit } from '../../api/schemas/quota'
import { useStorageDomains } from '../../hooks/useStorageDomains'
import { useDeleteQuotaStorageLimit, useQuotaStorageLimits } from '../../hooks/useQuotaMutations'
import { useT } from '../../i18n/useT'
import { ConfirmModal } from '../ConfirmModal'
import { QuotaStorageLimitModal } from './QuotaStorageLimitModal'
import { formatGibLimit, isAllTargets } from './quota-limits'

// Per-storage-domain GiB caps. Backs GET /quotas/{id}/quotastoragelimits
// (useQuotaStorageLimits); a limit with a null storage link is the "All storage
// domains" sentinel that caps the whole data center. -1 is "Unlimited". CRUD is
// admin-only server-side; the detail route is already gated behind loaded &&
// isAdmin in QuotaDetailPage, so this tab does not re-gate. Remove confirms via
// the shared danger ConfirmModal.
export function QuotaStorageLimitsTab({
  quotaId,
  dataCenterId,
}: {
  quotaId: string
  dataCenterId?: string
}) {
  const t = useT()
  const limits = useQuotaStorageLimits(quotaId)
  const storageDomains = useStorageDomains()
  const remove = useDeleteQuotaStorageLimit()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<QuotaStorageLimit | null>(null)
  const [removing, setRemoving] = useState<QuotaStorageLimit | null>(null)

  // Storage domains attached to the quota's data center back the target select
  // and resolve the grid's target-name column. A domain lists its attached DCs
  // under data_centers.data_center[] (listStorageDomains follows the link), so
  // scope by membership. That followed read degrades to a bare list on some live
  // engines (see listStorageDomains) — when NO domain carries attachment info we
  // can't scope, so offer every domain rather than an empty picker.
  const allDomains = storageDomains.data ?? []
  const canScopeByDataCenter =
    dataCenterId !== undefined &&
    allDomains.some((domain) => (domain.data_centers?.data_center ?? []).length > 0)
  const storageOptions = allDomains
    .filter(
      (domain) =>
        !canScopeByDataCenter ||
        (domain.data_centers?.data_center ?? []).some((dc) => dc.id === dataCenterId),
    )
    .map((domain) => ({ id: domain.id, name: domain.name ?? domain.id }))
  const storageNames = new Map(storageOptions.map((option) => [option.id, option.name]))

  const usedStorageIds = new Set((limits.data ?? []).map((limit) => limit.storage_domain?.id ?? ''))

  const targetName = (limit: QuotaStorageLimit) => {
    const id = limit.storage_domain?.id
    if (isAllTargets(id)) return t('quota.limits.allStorage')
    return limit.storage_domain?.name ?? storageNames.get(id as string) ?? id
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
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void limits.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {limits.isSuccess && limits.data.length === 0 && (
        <EmptyState titleText={t('quota.limits.storage')}>
          <EmptyStateBody>{t('quota.limits.storage.emptyBody')}</EmptyStateBody>
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
        <Table aria-label={t('quota.limits.storage')} variant="compact">
          <Thead>
            <Tr>
              <Th>{t('quota.limits.column.storageDomain')}</Th>
              <Th>{t('quota.limits.storageGib')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {limits.data.map((limit, index) => (
              <Tr key={limit.id ?? index}>
                <Td dataLabel={t('quota.limits.column.storageDomain')}>{targetName(limit)}</Td>
                <Td dataLabel={t('quota.limits.storageGib')}>
                  {formatGibLimit(limit.limit, t('quota.limits.unlimited'))}
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
        <QuotaStorageLimitModal
          quotaId={quotaId}
          storageOptions={storageOptions}
          usedStorageIds={usedStorageIds}
          isOpen
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <QuotaStorageLimitModal
          quotaId={quotaId}
          storageOptions={storageOptions}
          usedStorageIds={usedStorageIds}
          limit={editing}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('quota.limits.storage.remove.title', { name: targetName(removing) ?? '' })}
          body={t('quota.limits.storage.remove.body')}
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
