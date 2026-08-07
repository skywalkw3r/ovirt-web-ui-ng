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
import type { MacPool } from '../api/schemas/mac-pool'
import { useCapabilities } from '../auth/capabilities'
import { ConfirmModal } from '../components/ConfirmModal'
import { ListPageHeader } from '../components/ListPageHeader'
import { NotPermitted } from '../components/NotPermitted'
import { RefreshControl } from '../components/RefreshControl'
import { SearchInput } from '../components/list-toolbar/SearchInput'
import { MacPoolFormModal } from '../components/mac-pool-form/MacPoolFormModal'
import { useDeleteMacPool, useMacPools } from '../hooks/useMacPools'
import { sortRows, useColumnSort } from '../hooks/useColumnSort'
import { useT } from '../i18n/useT'

// Human-readable ranges cell: the count, plus the single range inline when there
// is exactly one (the common case), so the table conveys the addresses at a
// glance without a detail drill-down.
function rangesSummary(pool: MacPool, t: ReturnType<typeof useT>): string {
  const ranges = pool.ranges?.range ?? []
  if (ranges.length === 0) return t('macPools.ranges.none')
  if (ranges.length === 1) {
    const [only] = ranges
    const from = only.from ?? '?'
    const to = only.to ?? '?'
    return `${from} – ${to}`
  }
  return t('macPools.ranges.count', { count: ranges.length })
}

const MAC_POOL_KEYS = ['name', 'description', 'duplicates', 'ranges'] as const

export function MacPoolsPage() {
  const t = useT()
  const { loaded, isAdmin } = useCapabilities()
  const pools = useMacPools()
  const remove = useDeleteMacPool()

  // create when the flag is set; edit when a pool is set; removing gates the
  // destructive ConfirmModal per project rule. Only one is up at a time.
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MacPool | null>(null)
  const [removing, setRemoving] = useState<MacPool | null>(null)
  // client-side name/description filter — /macpools has no server-side search
  const [filter, setFilter] = useState('')

  // The nav already hides MAC pools from user-tier accounts; this covers deep
  // links typed straight into the address bar. Skeletons cover the pre-profile
  // window (loaded=false) instead of flashing the lock at users who will turn
  // out to be admins.
  // header sort — before the admin gate so hook order stays stable
  const { sort, thSort } = useColumnSort()
  if (loaded && !isAdmin) {
    return (
      <PageSection>
        <NotPermitted what={t('macPools.notPermitted')} />
      </PageSection>
    )
  }

  const items = pools.data ?? []
  const needle = filter.trim().toLowerCase()
  const filtered = items.filter(
    (pool) =>
      needle === '' ||
      (pool.name ?? pool.id).toLowerCase().includes(needle) ||
      (pool.description ?? '').toLowerCase().includes(needle),
  )
  const sortedPools = sortRows(filtered, sort, (pool, key) =>
    key === 'name'
      ? (pool.name ?? pool.id)
      : key === 'description'
        ? pool.description || undefined
        : key === 'duplicates'
          ? pool.allow_duplicates
            ? 1
            : 0
          : (pool.ranges?.range?.length ?? 0),
  )

  return (
    <PageSection>
      <ListPageHeader
        title={t('macPools.title')}
        actions={
          loaded && pools.isSuccess && items.length > 0 ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('macPools.new')}
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
              hint={t('macPools.filter.hint')}
              ariaLabel={t('macPools.filter.ariaLabel')}
            />
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <RefreshControl />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {!loaded && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('macPools.loading')} />
        </>
      )}

      {loaded && pools.isPending && (
        <>
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" style={{ marginBottom: '0.5rem' }} />
          <Skeleton height="2.5rem" screenreaderText={t('macPools.loading')} />
        </>
      )}

      {loaded && pools.isError && (
        <EmptyState titleText={t('macPools.error.title')} status="danger">
          <EmptyStateBody>
            {pools.error instanceof Error ? pools.error.message : t('common.error.unknown')}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => void pools.refetch()}>
                {t('common.action.retry')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && pools.isSuccess && items.length === 0 && (
        <EmptyState titleText={t('macPools.empty.title')}>
          <EmptyStateBody>{t('macPools.empty.body')}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('macPools.new')}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      )}

      {loaded && pools.isSuccess && items.length > 0 && sortedPools.length === 0 && (
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

      {loaded && pools.isSuccess && items.length > 0 && sortedPools.length > 0 && (
        <Table aria-label={t('macPools.table.ariaLabel')} variant="compact">
          <Thead>
            <Tr>
              <Th sort={thSort(MAC_POOL_KEYS, 0)}>{t('common.field.name')}</Th>
              <Th sort={thSort(MAC_POOL_KEYS, 1)}>{t('common.field.description')}</Th>
              <Th sort={thSort(MAC_POOL_KEYS, 2)}>{t('macPools.column.allowDuplicates')}</Th>
              <Th sort={thSort(MAC_POOL_KEYS, 3)}>{t('macPools.column.ranges')}</Th>
              <Th screenReaderText={t('common.field.actions')} />
            </Tr>
          </Thead>
          <Tbody>
            {sortedPools.map((pool) => {
              // The engine's built-in Default pool cannot be removed (webadmin
              // forbids it, and a DELETE 409s). The per-row Remove is disabled
              // with this reason for it.
              const removeReason =
                pool.default_pool === true ? t('macPools.remove.defaultReason') : undefined
              return (
                <Tr key={pool.id}>
                  <Td dataLabel={t('common.field.name')}>{pool.name ?? pool.id}</Td>
                  <Td dataLabel={t('common.field.description')}>{pool.description || '—'}</Td>
                  <Td dataLabel={t('macPools.column.allowDuplicates')}>
                    {pool.allow_duplicates ? t('common.yes') : t('common.no')}
                  </Td>
                  <Td dataLabel={t('macPools.column.ranges')}>{rangesSummary(pool, t)}</Td>
                  <Td dataLabel={t('common.field.actions')} isActionCell>
                    <ActionsColumn
                      isDisabled={remove.isPending}
                      items={[
                        { title: t('common.action.edit'), onClick: () => setEditing(pool) },
                        {
                          title: t('common.action.remove'),
                          isDanger: true,
                          isDisabled: removeReason !== undefined,
                          description: removeReason,
                          onClick: () => setRemoving(pool),
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

      {creating && <MacPoolFormModal isOpen onClose={() => setCreating(false)} />}
      {editing && <MacPoolFormModal pool={editing} isOpen onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          isOpen
          title={t('macPools.remove.confirm.title', { name: removing.name ?? removing.id })}
          body={t('macPools.remove.confirm.body')}
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
