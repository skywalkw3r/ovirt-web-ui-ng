import { useState } from 'react'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { Link } from '@tanstack/react-router'
import type { Quota } from '../api/schemas/quota'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { QuotaFormModal } from '../components/quota-form/QuotaFormModal'
import { RefreshControl } from '../components/RefreshControl'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { useDataCenters } from '../hooks/useAdminResources'
import { useQuotas } from '../hooks/useParityResources'
import { useDeleteQuota } from '../hooks/useQuotaMutations'
import { useT } from '../i18n/useT'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'

const QUOTA_KEYS = ['name', 'description', 'datacenter'] as const

export function QuotasPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const quotas = useQuotas()
  const dataCenters = useDataCenters()
  const remove = useDeleteQuota()

  // create when the flag is set; edit when a quota is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Quota | null>(null)
  const [removing, setRemoving] = useState<Quota | null>(null)
  // client-side name/description/data-center filter — the quota list is small
  const [filter, setFilter] = useState('')

  // The nav already hides Quotas from user-tier accounts; this covers deep
  // links typed straight into the address bar. Before the profile loads both
  // queries are disabled (isPending), so the skeletons cover that gap.
  // header sort — declared before the admin gate so hook order stays stable
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('quotas.notPermitted')} />
      </PageSection>
    )
  }

  // quota.data_center is a bare id link — names resolve client-side from the
  // datacenters collection. Waiting on dataCenters.isPending keeps resolved
  // names from flashing in as '—'; if the datacenters fetch fails the table
  // still renders, just with unresolved names.
  const dataCenterNames = new Map(
    (dataCenters.data ?? []).map((dataCenter) => [dataCenter.id, dataCenter.name]),
  )
  const needle = filter.trim().toLowerCase()
  const filteredQuotas = (quotas.data ?? []).filter((quota) => {
    if (needle === '') return true
    const dcName =
      quota.data_center?.id !== undefined ? (dataCenterNames.get(quota.data_center.id) ?? '') : ''
    return (
      (quota.name ?? '').toLowerCase().includes(needle) ||
      (quota.description ?? '').toLowerCase().includes(needle) ||
      dcName.toLowerCase().includes(needle)
    )
  })
  const sortedQuotas = sortRows(filteredQuotas, sort, (quota, key) =>
    key === 'name'
      ? quota.name
      : key === 'description'
        ? quota.description || undefined
        : quota.data_center?.id !== undefined
          ? dataCenterNames.get(quota.data_center.id)
          : undefined,
  )

  return (
    <PageSection>
      <ListPageHeader
        title={t('quotas.title')}
        actions={
          quotas.isSuccess && !dataCenters.isPending && quotas.data.length > 0 ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('quotas.new')}
            </Button>
          ) : undefined
        }
      />
      <Toolbar style={{ paddingBottom: 'var(--pf-t--global--spacer--md)' }}>
        <ToolbarContent>
          <ToolbarItem style={{ width: '18rem' }}>
            <SearchInput
              value={filter}
              onChange={setFilter}
              onCommit={() => {}}
              hint={t('quotas.filter.hint')}
              ariaLabel={t('quotas.filter.ariaLabel')}
            />
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {(quotas.isPending || dataCenters.isPending) && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('quotas.loading')} />
        </>
      )}

      {quotas.isError && (
        <EmptyState titleText={t('quotas.error.title')} status="danger">
          <EmptyStateBody>
            {quotas.error instanceof Error ? quotas.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void quotas.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {quotas.isSuccess && !dataCenters.isPending && quotas.data.length === 0 && (
        <EmptyState titleText={t('quotas.empty.title')}>
          <EmptyStateBody>{t('quotas.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('quotas.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {quotas.isSuccess &&
        !dataCenters.isPending &&
        quotas.data.length > 0 &&
        sortedQuotas.length === 0 && (
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

      {quotas.isSuccess && !dataCenters.isPending && sortedQuotas.length > 0 && (
        <Table aria-label={t('quotas.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(QUOTA_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(QUOTA_KEYS, 1)}>{t('common.field.description')}</Th>
              <Th sort={thSort(QUOTA_KEYS, 2)}>{t('quotas.column.dataCenter')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedQuotas.map((quota) => {
              const dataCenterName =
                quota.data_center?.id === undefined
                  ? undefined
                  : dataCenterNames.get(quota.data_center.id)
              return (
                <Tr key={quota.id}>
                  <Td dataLabel={t('common.field.name')}>
                    <Link to="/quotas/$quotaId" params={{ quotaId: quota.id }}>
                      {quota.name}
                    </Link>
                  </Td>
                  <Td dataLabel={t('common.field.description')}>{quota.description || '—'}</Td>
                  <Td dataLabel={t('quotas.column.dataCenter')}>{dataCenterName ?? '—'}</Td>
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        { title: t('common.action.edit'), onClick: () => setEditing(quota) },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          onClick: () => setRemoving(quota),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      {creating && <QuotaFormModal isOpen onClose={() => setCreating(false)} />}
      {editing && <QuotaFormModal quota={editing} isOpen onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('quotas.remove.confirm.title', {
            name: removing.name ?? removing.id,
          })}
          body={t('quotas.remove.confirm.body')}
          confirmLabel={t('common.action.remove')}
          isConfirmDisabled={remove.isPending}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            remove.mutate({ id: target.id, name: target.name })
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </PageSection>
  )
}
